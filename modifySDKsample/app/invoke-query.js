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
var logger = log4js.getLogger("Query-Chaincode");
logger.setLevel('DEBUG');
//######################

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
//######################

var tx_id = null;
var nonce = null;
var adminUser = null;
var mspid = null;



logger.debug('\n============ Query B Val ============\n')
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
	var orgName = "peerOrg1"
	

	var targets = [];
	// set up the chain to use each org's 'peer1' for
	// both requests and events
	
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

	return hfc.newDefaultKeyValueStore({
    	path: "./keypath_"+orgName
	}).then((store) => {
		client.setStateStore(store);
    	return getUserContext(client,"http://localhost:7054","admin","adminpw")
	}).then((admin) => {
		adminUser = admin;
		nonce = utils.getNonce();
		tx_id = chain.buildTransactionID(nonce, adminUser);

		
		var request = {
			chaincodeId: "mycc",
			chaincodeVersion: "v0",
			chainId: channelName,
			txId: tx_id,
			nonce: nonce,
			fcn: "invoke",
			args: ["query","b"]
		};
		return chain.queryByChaincode(request);
	},
	(err) => {
		logger.info('Failed to get submitter \'admin\'');
		logger.error('Failed to get submitter \'admin\'. Error: ' + err.stack ? err.stack : err );
	}).then((response_payloads) => {
		if (response_payloads) {
			for(let i = 0; i < response_payloads.length; i++) {
				logger.info('User b now has '+response_payloads[i].toString('utf8')+' after the move')
				logger.debug('\n============ Query B Val is SUCCESS ============\n')
			}
		} else {
			logger.error('response_payloads is null');
		}
	},
	(err) => {
		logger.error('Failed to send query due to error: ' + err.stack ? err.stack : err);
	}).catch((err) => {
		logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
	});
