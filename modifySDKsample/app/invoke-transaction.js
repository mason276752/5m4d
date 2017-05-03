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
var logger = log4js.getLogger("Invoke-Chaincode");
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
var allEventhubs = [];
var isSuccess = null;
var mspid=null;

// on process exit, always disconnect the event hub
process.on('exit', function() {
	if (isSuccess){
		logger.debug('\n============ Invoke transaction is SUCCESS ============\n')
	}else{
		logger.debug('\n!!!!!!!! ERROR: Invoke 交易失敗 !!!!!!!!\n')
	}
	for(var key in allEventhubs) {
		var eventhub = allEventhubs[key];
		if (eventhub && eventhub.isconnected()) {
			//logger.debug('Disconnecting the event hub');
			eventhub.disconnect();
		}
	}
});

logger.debug('\n============ Invoke Transaction ============\n')
var org ="org2" // org2
var client = new hfc();
var channelName="mychannel"
var chain = client.newChain(channelName);
var orgName = "peerOrg2"
var mspid="Org2MSP"
var  eventhubs = [];

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
chain.addPeer(peer2)

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

hfc.newDefaultKeyValueStore({
	path: __dirname+"/keypath_"+orgName
}).then((store) => {
	client.setStateStore(store);
return getUserContext(client,"http://localhost:8054","admin","adminpw")
}).then((admin) => {
	logger.info('成功註冊用戶 \'admin\'');
	adminUser = admin;

	nonce = utils.getNonce();
	tx_id = chain.buildTransactionID(nonce, adminUser);
	utils.setConfigSetting('E2E_TX_ID', tx_id);
	logger.info('setConfigSetting("E2E_TX_ID") = %s', tx_id);
	logger.debug(util.format('傳送交易 "%s"', tx_id));

	// send proposal to endorser
	var request = {
		chaincodeId: "mycc",
		chaincodeVersion: "v0",
		chainId: channelName,
		fcn: "invoke",
		args: ["move","a","b","100"],
		txId: tx_id,
		nonce: nonce
	};
	return chain.sendTransactionProposal(request);

}, (err) => {
	logger.error('無法註冊用戶 \'admin\'. ' + err);
	throw new Error('無法註冊用戶 \'admin\'. ' + err);

}).then((results) => {

	var proposalResponses = results[0];

	var proposal = results[1];
	var header   = results[2];
	var all_good = true;
	for(var i in proposalResponses) {
		let one_good = false;
		if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
			one_good = true;
			logger.info('交易請求良好');
		} else {
			logger.error('交易請求不好');
		}
		all_good = all_good & one_good;
	}
	if (all_good) {
		logger.debug(util.format('成功傳送請求和收到回覆：\n  Status - %s, message - "%s",\n  metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
		var request = {
			proposalResponses: proposalResponses,
			proposal: proposal,
			header: header
		};

		var deployId = tx_id.toString();

		var eventPromises = [];
		eventhubs.forEach((eh) => {
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(reject, 30000);

				eh.registerTxEvent(deployId.toString(), (tx, code) => {
					clearTimeout(handle);
					eh.unregisterTxEvent(deployId);

					if (code !== 'VALID') {
						logger.error('餘額轉換交易無效, code = ' + code);
						reject();
					} else {
						logger.info('餘額轉換交易已經提交到peer'+ eh.ep._endpoint.addr);
						resolve();
					}
				});
			});

			eventPromises.push(txPromise);
		});

		var sendPromise = chain.sendTransaction(request);
		return Promise.all([sendPromise].concat(eventPromises))
		.then((results) => {

			logger.debug('事件 promise 全部完成和測試完成');
			return results[0];

		}).catch((err) => {

			logger.error('無法傳送初始化交易和得到超時通知');
			throw new Error('無法傳送初始化交易和得到超時通知');

		});

	} else {
		logger.error('無法傳送初始化請求或收到有效Response,Response null or status is not 200,結束...');
		throw new Error('無法傳送初始化請求或收到有效Response,Response null or status is not 200,結束...');
	}
}, (err) => {

	logger.error('無法傳送請求 error: ' + err.stack ? err.stack : err);
	throw new Error('無法傳送請求 error: ' + err.stack ? err.stack : err);

}).then((response) => {

	if (response.status === 'SUCCESS') {
		logger.info('成功傳送交易到Orderer');
		logger.debug('***************************************************');
		logger.debug('TX_ID='+'\''+tx_id+'\'');
		logger.debug('***************************************************');

		isSuccess = true;
		process.exit();

	} else {
		logger.error('無法交易 Error code: ' + response.status);
		throw new Error('無法交易 Error code: ' + response.status);
	}
}, (err) => {
	logger.error('無法傳送交易 error: ' + err.stack ? err.stack : err);
	throw new Error('無法傳送交易 error: ' + err.stack ? err.stack : err);
});
