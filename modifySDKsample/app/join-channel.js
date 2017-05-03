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
//##########################
function login(client,ca_client,username,password){
    var member=null;
    return ca_client.enroll({
        enrollmentID: username,
        enrollmentSecret: password
    }).then((enrollment) => {
        console.log('成功註冊用戶： \'' + username + '\'');
        member = new User(username, client);
        return member.setEnrollment(enrollment.key, enrollment.certificate, mspid);
    }).then(() => {
        return client.setUserContext(member);
    }).then(() => {
        return member;
    }).catch((err) => {
        console.log('無法註冊用戶。Error: ' + err.stack ? err.stack : err);
        throw new Error('無法獲取注册用戶');
    });
}
function getUserContext(client,caUrl,username,password){
    return client.getUserContext(username).then((user) => {
        if (user && user.isEnrolled()) {
            console.log('從檔案成功載入成員');
            return user;
        } else {
            var ca_client = new copService(caUrl);
            
            return login(client,ca_client,username,password)
        }
    });
}

//##########################
var adminUser = null;
var tx_id = null;
var nonce = null;
var mspid=null;
var channelName="mychannel";
var allEventhubs = [];
var _commonProto = grpc.load(path.join(__dirname, '../node_modules/fabric-client/lib/protos/common/common.proto')).common;
var isSuccess = null;

//程序離開事件
process.on('exit', function() {
	if (isSuccess){
		logger.debug('\n============ 成功加入通道 ============\n')
	}else{
		logger.debug('\n!!!!!!!! ERROR: 加入通道失敗 !!!!!!!!\n')
	}
	for(var key in allEventhubs) {
		var eventhub = allEventhubs[key];
		if (eventhub && eventhub.isconnected()) {
			eventhub.disconnect();
		}
	}
});
//######################

logger.debug('\n============ 加入通道 ============\n')

//Promise
//.then
//  join channel peer in Org1
//.then
//  join channel peer in Org2
new Promise((resolve, reject)=>{
	resolve(true)
}).then(()=>{
	var client = new hfc();
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
		path: __dirname+"/keypath_"+orgName
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

					if(block.data.data.length === 1) {
						var envelope = _commonProto.Envelope.decode(block.data.data[0]);
						var payload = _commonProto.Payload.decode(envelope.payload);
						var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);

						if (channel_header.channel_id === channelName) {
							logger.info('peer已經成功加入通道 \''+channelName+'\'  ,peer:'+ eh.ep._endpoint.addr);
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
		logger.error('無法註冊用戶\'admin\': ' + err.stack ? err.stack : err);
		throw new Error('無法註冊用戶\'admin\':  ' + err.stack ? err.stack : err);
	})
	.then((results) => {
		logger.debug(util.format('加入通道results : %j', results));

		if(results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
			logger.info(util.format('成功加入 組織:%s 的peer加入渠道', orgName));
		} else {
			logger.error('無法加入通道');
			throw new Error('無法加入通道');
		}
	}, (err) => {
		logger.error('無法加入通道 error: ' + err.stack ? err.stack : err);
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
		path: __dirname+"/keypath_"+orgName
	}).then((store) => {
		client.setStateStore(store);
		return getUserContext(client,"http://localhost:8054","admin","adminpw")
	})
	.then((admin) => {
		logger.info('成功註冊用戶 \'admin\'');
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
					if(block.data.data.length === 1) {

						var envelope = _commonProto.Envelope.decode(block.data.data[0]);
						var payload = _commonProto.Payload.decode(envelope.payload);
						var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);

						if (channel_header.channel_id === channelName) {
							logger.info('peer已經成功加入通道 \''+channelName+'\'  ,peer:'+ eh.ep._endpoint.addr);
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
		logger.error('無法註冊用戶\'admin\': ' + err.stack ? err.stack : err);
		throw new Error('無法註冊用戶\'admin\':  ' + err.stack ? err.stack : err);
	})
	.then((results) => {
		logger.debug(util.format('加入通道results : %j', results));

		if(results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
			logger.info(util.format('成功加入 組織:%s 的peer加入渠道', orgName));
		} else {
			logger.error('無法加入通道');
			throw new Error('無法加入通道');
		}
	}, (err) => {
		logger.error('無法加入通道 error: ' + err.stack ? err.stack : err);
		process.exit();
	});
}).then(() => {
	isSuccess = true;
	process.exit();
}, (err) => {
	process.exit();
}).catch(function(err) {
	logger.error('請求失敗. ' + err);
	process.exit();
});
