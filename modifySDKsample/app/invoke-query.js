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
        console.log('无法注册用戶。Error: ' + err.stack ? err.stack : err);
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

var tx_id = null;
var nonce = null;
var adminUser = null;
var mspid = null;


logger.debug('\n============ Query B Val ============\n')
	var client = new hfc();
	var channelName="mychannel"
	var orgName = "peerOrg1"
	mspid="Org1MSP"
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

	data = fs.readFileSync(path.join(__dirname,"../artifacts/tls/peers/peer0/ca-cert.pem"));
	var peer0=new Peer(
		"grpcs://localhost:7051",
		{
			pem: Buffer.from(data).toString(),
			'ssl-target-name-override': "peer0"
		}
	)
	chain.addPeer(peer0)

	hfc.newDefaultKeyValueStore({
    	path: __dirname+"/keypath_"+orgName
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
		logger.info('無法註冊用戶 \'admin\'');
		logger.error('無法註冊用戶 \'admin\'. Error: ' + err.stack ? err.stack : err );
	}).then((response_payloads) => {
		if (response_payloads) {
			for(let i = 0; i < response_payloads.length; i++) {
				logger.info('使用者 b 移動後現在有 '+response_payloads[i].toString('utf8'))
				logger.debug('\n============ Query B Val is SUCCESS ============\n')
			}
		} else {
			logger.error('response_payloads is null');
		}
	},
	(err) => {
		logger.error('無法傳送Query error: ' + err.stack ? err.stack : err);
	}).catch((err) => {
		logger.error('無法傳送Query error: ' + err.stack ? err.stack : err);
	});
