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
var logger = log4js.getLogger("Instantiate-Chaincode");
logger.setLevel('DEBUG');
//###################

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

//###################

var tx_id = null;
var nonce = null;
var adminUser = null;
var allEventhubs = [];
var isSuccess = null;
var mspid=null;
	
process.on('exit', function() {
	if (isSuccess){
		logger.debug('\n============ Chaincode Instantiateion is SUCCESS ============\n')
	}else{
		logger.debug('\n!!!!!!!! ERROR: Chaincode Instantiateion FAILED !!!!!!!!\n')
	}
	for(var key in allEventhubs) {
		var eventhub = allEventhubs[key];
		if (eventhub && eventhub.isconnected()) {
			eventhub.disconnect();
		}
	}
});


logger.debug('\n============ Instantiate Chaincode ============\n')
	var client = new hfc();
	var channelName="mychannel"
	var chain = client.newChain(channelName);
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
	mspid="Org1MSP"
	var orgName = "peerOrg1";

	var targets = [],
		eventhubs = [];

	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer0/ca-cert.pem"));
	var peer0=new Peer(
		"grpcs://localhost:7051",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer0"
		}
	)
	targets.push(peer0);
	chain.addPeer(peer0)


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
	

	hfc.newDefaultKeyValueStore({
    	path: "./keypath_"+orgName
	}).then((store) => {
		client.setStateStore(store);
    return getUserContext(client,"http://localhost:7054","admin","adminpw")
	}).then((admin) => {
		logger.info('Successfully enrolled user \'admin\'');
		adminUser = admin;
		return chain.initialize();
	}, (err) => {
		logger.error('Failed to enroll user \'admin\'. ' + err);
		throw new Error('Failed to enroll user \'admin\'. ' + err);

	}).then((success) => {

		nonce = utils.getNonce();
		tx_id = chain.buildTransactionID(nonce, adminUser);

		// send proposal to endorser
		var request = {
			chaincodePath: "github.com/example_cc",
			chaincodeId: "mycc",
			chaincodeVersion: "v0",
			fcn: "init",
			args: ["a","100","b","200"],
			chainId: channelName,
			txId: tx_id,
			nonce: nonce
		};
		return chain.sendInstantiateProposal(request);

	}, (err) => {

		logger.error('Failed to initialize the chain');
		throw new Error('Failed to initialize the chain');

	}).then((results) => {

		var proposalResponses = results[0];

		var proposal = results[1];
		var header   = results[2];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
				one_good = true;
				logger.info('instantiate proposal was good');
			} else {
				logger.error('instantiate proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			logger.info(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal,
				header: header
			};

			// set the transaction listener and set a timeout of 30sec
			// if the transaction did not get committed within the timeout period,
			// fail the test
			var deployId = tx_id.toString();

			var eventPromises = [];
			eventhubs.forEach((eh) => {
				let txPromise = new Promise((resolve, reject) => {
					let handle = setTimeout(reject, 30000);

					eh.registerTxEvent(deployId.toString(), (tx, code) => {
						logger.info('The chaincode instantiate transaction has been committed on peer '+ eh.ep._endpoint.addr);
						clearTimeout(handle);
						eh.unregisterTxEvent(deployId);

						if (code !== 'VALID') {
							logger.error('The chaincode instantiate transaction was invalid, code = ' + code);
							reject();
						} else {
							logger.info('The chaincode instantiate transaction was valid.');
							resolve();
						}
					});
				});
				eventPromises.push(txPromise);
			});

			var sendPromise = chain.sendTransaction(request);
			return Promise.all([sendPromise].concat(eventPromises))
			.then((results) => {
				logger.debug('Event promise all complete and testing complete');
				return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
			}).catch((err) => {
				logger.error('Failed to send instantiate transaction and get notifications within the timeout period.');
				throw new Error('Failed to send instantiate transaction and get notifications within the timeout period.');
			});
		} else {
			logger.error('Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...');
			throw new Error('Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}, (err) => {
		logger.error('Failed to send instantiate proposal due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send instantiate proposal due to error: ' + err.stack ? err.stack : err);
	}).then((response) => {
		if (response.status === 'SUCCESS') {
			logger.info('Successfully sent transaction to the orderer.');
			isSuccess = true;
			process.exit();
		} else {
			logger.error('Failed to order the transaction. Error code: ' + response.status);
			throw new Error('Failed to order the transaction. Error code: ' + response.status);
		}
	}, (err) => {
		logger.error('Failed to send instantiate due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send instantiate due to error: ' + err.stack ? err.stack : err);
	});
