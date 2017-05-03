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
//##########################
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
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
var client = new hfc();
var channelName="mychannel"
var chain = client.newChain(channelName);
var orgName = "peerOrg1"
var mspid="Org1MSP"


logger.debug('\n============ 創建通道 ============\n')
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


hfc.newDefaultKeyValueStore({
	path: __dirname+"/keypath_"+orgName
}).then((store) => {
	client.setStateStore(store);
	return getUserContext(client,"http://localhost:7054","admin","adminpw")
})
.then((admin) => {
	logger.debug('成功註冊用戶： \'admin\'');
	// readin the envelope to send to the orderer
	var data = fs.readFileSync(path.join(__dirname, "../artifacts/channel/mychannel.tx"))
	var request = {
		envelope : data
	};
	// send to orderer
	return chain.createChannel(request);
}, (err) => {
	logger.error('無法註冊用戶： \'admin\'. ' + err);
})
.then((response) => {
	logger.debug('Response:%j',response);
	if (response && response.status === 'SUCCESS') {
		logger.debug('成功創建通道');
		return sleep(5000);
	} else {
		logger.error('無法創建通道. ');
		logger.debug('\n!!!!!!!!! 無法創建通道： \''+channelName+'\' !!!!!!!!!\n\n')
	}
}, (err) => {
	logger.error('無法初始化通道: ' + err.stack ? err.stack : err);
})
.then((nothing) => {
	logger.debug('成功地等待確認頻道建立： \''+channelName+'\' .');
	logger.debug('\n====== 創建通道 \''+channelName+'\' 完成 ======\n\n')
}, (err) => {
	logger.error('由於錯誤而無法sleep: ' + err.stack ? err.stack : err);
});
