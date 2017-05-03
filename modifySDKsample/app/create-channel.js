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
var logger = log4js.getLogger("Create-Channel");
logger.setLevel('DEBUG');

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
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
var client = new hfc();
var channelName="mychannel"
var chain = client.newChain(channelName);



logger.debug('\n============ Create Channel ============\n')
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

var org = "peerOrg1"
var mspid="Org1MSP"
hfc.newDefaultKeyValueStore({
	path: "./keypath_"+org
}).then((store) => {
	client.setStateStore(store);
	return getUserContext(client,"http://localhost:7054","admin","adminpw")
})
.then((admin) => {
	logger.debug('Successfully enrolled user \'admin\'');
	// readin the envelope to send to the orderer
	var data = fs.readFileSync(path.join(__dirname, "../artifacts/channel/mychannel.tx"))
	var request = {
		envelope : data
	};
	// send to orderer
	return chain.createChannel(request);
}, (err) => {
	logger.error('Failed to enroll user \'admin\'. ' + err);
})
.then((response) => {
	logger.debug(' response ::%j',response);

	if (response && response.status === 'SUCCESS') {
		logger.debug('Successfully created the channel.');
		return sleep(5000);
	} else {
		logger.error('Failed to create the channel. ');
		logger.debug('\n!!!!!!!!! Failed to create the channel \''+channelName+'\' !!!!!!!!!\n\n')
	}
}, (err) => {
	logger.error('Failed to initialize the channel: ' + err.stack ? err.stack : err);
})
.then((nothing) => {
	logger.debug('Successfully waited to make sure channel \''+channelName+'\' was created.');
	logger.debug('\n====== Channel creation \''+channelName+'\' completed ======\n\n')
}, (err) => {
	logger.error('Failed to sleep due to error: ' + err.stack ? err.stack : err);
});
