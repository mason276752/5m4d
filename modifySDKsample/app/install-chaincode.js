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
var logger = log4js.getLogger("Install-Chaincode");
logger.setLevel('DEBUG');
var tx_id = null;
var nonce = null;
var adminUser = null;
var mspid = null;
process.env.GOPATH=path.join(__dirname, "../artifacts");

//##################

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

//##################
logger.debug('\n============ Install Chaincode ============\n')
new Promise((resolve, reject)=>{
	resolve(true)
}).then(()=>{
	var client = new hfc();
	var channelName="mychannel";

	var chain = client.newChain(channelName);
	mspid="Org1MSP"
	var orgName = "peerOrg1";
	var targets = []
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
	var peer0=new Peer(
		"grpcs://localhost:7051",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer0"
		}
	)
	targets.push(peer0);
	chain.addPeer(peer0)

	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer1/ca-cert.pem"));
	var peer1=new Peer(
		"grpcs://localhost:7056",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer1"
		}
	)
	targets.push(peer1);
	chain.addPeer(peer1)

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

		// send proposal to endorser
		var request = {
			targets: targets,
			chaincodePath: "github.com/example_cc",
			chaincodeId: "mycc",
			chaincodeVersion: "v0",
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendInstallProposal(request);
	},
	(err) => {
		logger.error('Failed to enroll user \'admin\'. ' + err);
		throw new Error('Failed to enroll user \'admin\'. ' + err);
	}).then((results) => {
		var proposalResponses = results[0];

		var proposal = results[1];
		var header   = results[2];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
				one_good = true;
				logger.info('install proposal was good');
			} else {
				logger.error('install proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			logger.info(util.format('Successfully sent install Proposal and received ProposalResponse: Status - %s', proposalResponses[0].response.status));
		} else {
			logger.error('Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	},
	(err) => {
		logger.error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
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
	var peer2=new Peer(
		"grpcs://localhost:8051",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer2"
		}
	)
	targets.push(peer2);
	chain.addPeer(peer2)

	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer3/ca-cert.pem"));
	var peer3=new Peer(
		"grpcs://localhost:8056",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer3"
		}
	)
	targets.push(peer3);
	chain.addPeer(peer3)


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

		// send proposal to endorser
		var request = {
			targets: targets,
			chaincodePath: "github.com/example_cc",
			chaincodeId: "mycc",
			chaincodeVersion: "v0",
			txId: tx_id,
			nonce: nonce
		};

		return chain.sendInstallProposal(request);
	},
	(err) => {
		logger.error('Failed to enroll user \'admin\'. ' + err);
		throw new Error('Failed to enroll user \'admin\'. ' + err);
	}).then((results) => {
		var proposalResponses = results[0];

		var proposal = results[1];
		var header   = results[2];
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
				one_good = true;
				logger.info('install proposal was good');
			} else {
				logger.error('install proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			logger.info(util.format('Successfully sent install Proposal and received ProposalResponse: Status - %s', proposalResponses[0].response.status));
		} else {
			logger.error('Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	},
	(err) => {
		logger.error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
	});
}).then(()=>{
	logger.debug('\n============ Install is  is SUCCESS ============\n')
},(err)=>{

})
