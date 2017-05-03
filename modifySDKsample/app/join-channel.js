/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var grpc = require('grpc');
var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var Orderer=require("fabric-client/lib/Orderer");
var User = require('fabric-client/lib/User.js');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');
var log4js = require('log4js');
var logger = log4js.getLogger("Join-Channel");
logger.setLevel('DEBUG');
var adminUser = null;
var tx_id = null;
var nonce = null;
var mspid=null;



//################

function login(client,ca_client,username,password){
    var member=null;
    return ca_client.enroll({
        enrollmentID: username,
        enrollmentSecret: password
    }).then((enrollment) => {
        console.log('Successfully enrolled user \'' + username + '\'');
        member = new User(username, client);
        return member.setEnrollment(enrollment.key, enrollment.certificate, mspid);
    }).then(() => {
        return client.setUserContext(member);
    }).then(() => {
        return member;
    }).catch((err) => {
        console.log('Failed to enroll and persist user. Error: ' + err.stack ? err.stack : err);
        throw new Error('Failed to obtain an enrolled user');
    });
}
function getUserContext(client,caUrl,username,password){
    return client.getUserContext(username).then((user) => {
        if (user && user.isEnrolled()) {
            console.log('Successfully loaded member from persistence');
            return user;
        } else {
            // need to enroll it with CA server
            var ca_client = new copService(caUrl);
            
            return login(client,ca_client,username,password)
        }
    });
}

//################



var allEventhubs = [];

var _commonProto = grpc.load(path.join(__dirname, '../node_modules/fabric-client/lib/protos/common/common.proto')).common;
var isSuccess = null;

logger.debug('\n============ Join Channel ============\n')
	// on process exit, always disconnect the event hub
process.on('exit', function() {
	if (isSuccess){
		logger.debug('\n============ Join Channel is SUCCESS ============\n')
	}else{
		logger.debug('\n!!!!!!!! ERROR: Join Channel FAILED !!!!!!!!\n')
	}
	for(var key in allEventhubs) {
		var eventhub = allEventhubs[key];
		if (eventhub && eventhub.isconnected()) {
			eventhub.disconnect();
		}
	}
});


//######################

new Promise((resolve, reject)=>{
	resolve(true)
}).then(()=>{
	var client = new hfc();
	var channelName="mychannel";

	var chain = client.newChain(channelName);
	mspid="Org1MSP"
	var orgName = "peerOrg1";
	var targets = [], eventhubs = [];
	var data=fs.readFileSync(path.join(__dirname, "../artifacts/tls/orderer/ca-cert.pem"));
	chain.addOrderer(
	new Orderer(
			"grpcs://localhost:7050",
			{
				'pem': Buffer.from(data).toString(),
				'ssl-target-name-override': "orderer0"
			}
		)
	);


	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer0/ca-cert.pem"));
	targets.push(
		new Peer(
			"grpcs://localhost:7051",
			{
				pem: Buffer.from(data).toString(),
				'ssl-target-name-override': "peer0"
			}
		)
	);

	var eh = new EventHub();
	eh.setPeerAddr(
		"grpcs://localhost:7053",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer0"
		}
	);
	eh.connect();
	eventhubs.push(eh);
	allEventhubs.push(eh);

	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer1/ca-cert.pem"));
	targets.push(
		new Peer(
			"grpcs://localhost:7056",
			{
				pem: Buffer.from(data).toString(),
				'ssl-target-name-override': "peer1"
			}
		)
	);

	var eh = new EventHub();
	eh.setPeerAddr(
		"grpcs://localhost:7058",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer1"
		}
	);
	eh.connect();
	eventhubs.push(eh);
	allEventhubs.push(eh);

	return hfc.newDefaultKeyValueStore({
		path: "./keypath_"+orgName
	}).then((store) => {
		client.setStateStore(store);
		return getUserContext(client,"http://localhost:7054","admin","adminpw")
	})
	.then((admin) => {
		logger.info('Successfully enrolled user \'admin\'');
		adminUser = admin;

		nonce = utils.getNonce();
		tx_id = chain.buildTransactionID(nonce, adminUser);
		var request = {
			targets : targets,
			txId : 	tx_id,
			nonce : nonce
		};

		var eventPromises = [];
		eventhubs.forEach((eh) => {
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(reject, 30000);

				eh.registerBlockEvent((block) => {
					clearTimeout(handle);

					// in real-world situations, a peer may have more than one channels so
					// we must check that this block came from the channel we asked the peer to join
					if(block.data.data.length === 1) {
						// Config block must only contain one transaction
						var envelope = _commonProto.Envelope.decode(block.data.data[0]);
						var payload = _commonProto.Payload.decode(envelope.payload);
						var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);

						if (channel_header.channel_id === channelName) {
							logger.info('The channel \''+channelName+'\' has been successfully joined on peer '+ eh.ep._endpoint.addr);
							resolve();
						}
					}
				});
			});

			eventPromises.push(txPromise);
		});

		let sendPromise = chain.joinChannel(request);
		return Promise.all([sendPromise].concat(eventPromises));
	}, (err) => {
		logger.error('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
	})
	.then((results) => {
		logger.debug(util.format('Join Channel R E S P O N S E : %j', results));

		if(results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
			logger.info(util.format('Successfully joined peers in organization %s to join the channel', orgName));
		} else {
			logger.error(' Failed to join channel');
			throw new Error('Failed to join channel');
		}
	}, (err) => {
		logger.error('Failed to join channel due to error: ' + err.stack ? err.stack : err);
		process.exit();
	});
}).then(()=>{
	var client = new hfc();
	var channelName="mychannel";

	var chain = client.newChain(channelName);
	mspid="Org2MSP"
	var orgName = "peerOrg2";
	var targets = [], eventhubs = [];
	var data=fs.readFileSync(path.join(__dirname, "../artifacts/tls/orderer/ca-cert.pem"));
	chain.addOrderer(
	new Orderer(
			"grpcs://localhost:7050",
			{
				'pem': Buffer.from(data).toString(),
				'ssl-target-name-override': "orderer0"
			}
		)
	);


	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer2/ca-cert.pem"));
	targets.push(
		new Peer(
			"grpcs://localhost:8051",
			{
				pem: Buffer.from(data).toString(),
				'ssl-target-name-override': "peer2"
			}
		)
	);

	var eh = new EventHub();
	eh.setPeerAddr(
		"grpcs://localhost:8053",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer2"
		}
	);
	eh.connect();
	eventhubs.push(eh);
	allEventhubs.push(eh);

	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer3/ca-cert.pem"));
	targets.push(
		new Peer(
			"grpcs://localhost:8056",
			{
				pem: Buffer.from(data).toString(),
				'ssl-target-name-override': "peer3"
			}
		)
	);

	var eh = new EventHub();
	eh.setPeerAddr(
		"grpcs://localhost:8058",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer3"
		}
	);
	eh.connect();
	eventhubs.push(eh);
	allEventhubs.push(eh);

	return hfc.newDefaultKeyValueStore({
		path: "./keypath_"+orgName
	}).then((store) => {
		client.setStateStore(store);
		return getUserContext(client,"http://localhost:8054","admin","adminpw")
	})
	.then((admin) => {
		logger.info('Successfully enrolled user \'admin\'');
		adminUser = admin;

		nonce = utils.getNonce();
		tx_id = chain.buildTransactionID(nonce, adminUser);
		var request = {
			targets : targets,
			txId : 	tx_id,
			nonce : nonce
		};

		var eventPromises = [];
		eventhubs.forEach((eh) => {
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(reject, 30000);

				eh.registerBlockEvent((block) => {
					clearTimeout(handle);

					// in real-world situations, a peer may have more than one channels so
					// we must check that this block came from the channel we asked the peer to join
					if(block.data.data.length === 1) {
						// Config block must only contain one transaction
						var envelope = _commonProto.Envelope.decode(block.data.data[0]);
						var payload = _commonProto.Payload.decode(envelope.payload);
						var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);

						if (channel_header.channel_id === channelName) {
							logger.info('The channel \''+channelName+'\' has been successfully joined on peer '+ eh.ep._endpoint.addr);
							resolve();
						}
					}
				});
			});

			eventPromises.push(txPromise);
		});

		let sendPromise = chain.joinChannel(request);
		return Promise.all([sendPromise].concat(eventPromises));
	}, (err) => {
		logger.error('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
	})
	.then((results) => {
		logger.debug(util.format('Join Channel R E S P O N S E : %j', results));

		if(results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
			logger.info(util.format('Successfully joined peers in organization %s to join the channel', orgName));
		} else {
			logger.error(' Failed to join channel');
			throw new Error('Failed to join channel');
		}
	}, (err) => {
		logger.error('Failed to join channel due to error: ' + err.stack ? err.stack : err);
		process.exit();
	});
}).then(() => {
	isSuccess = true;
	process.exit();
}, (err) => {
	process.exit();
}).catch(function(err) {
	logger.error('Failed request. ' + err);
	process.exit();
});
