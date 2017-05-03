################### easy ####################

docker run --name orderer1 \
-e ORDERER_GENERAL_LISTENADDRESS=0.0.0.0 \
hyperledger/fabric-orderer orderer

docker run --name peer1 --link orderer1 -p 8051:7051 \
-v /var/run/docker.sock:/host/var/run/docker.sock \
-e CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock \
-e CORE_PEER_ID=peer1 -e CORE_PEER_ADDRESSAUTODETECT=true \
 hyperledger/fabric-peer peer node start -o orderer1:7050

docker run --name peer2 --link orderer1 -p 8051:7051 \
-v /var/run/docker.sock:/host/var/run/docker.sock \
-e CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock \
-e CORE_PEER_ID=peer2 -e CORE_PEER_ADDRESSAUTODETECT=true \
 hyperledger/fabric-peer peer node start -o orderer1:7050

docker run  -it --name cli --link orderer1 --link peer1 --link peer2 \
-v $GOPATH/src/github.com/hyperledger/fabric/examples/chaincode/go/chaincode_example02:/go/src/chaincode_example02 \
hyperledger/fabric-peer bash



peer channel create -o orderer1:7050 -c ch1
CORE_PEER_ADDRESS=peer1:7051 peer channel join -o orderer1:7050 -b ch1.block
CORE_PEER_ADDRESS=peer2:7051 peer channel join -o orderer1:7050 -b ch1.block


CORE_PEER_ADDRESS=peer1:7051 peer chaincode install -n mycc -v v0 -p chaincode_example02
CORE_PEER_ADDRESS=peer1:7051 peer chaincode instantiate -o orderer1:7050  -v v0 -n mycc -C ch1 -c '{"Args":["init","a","100","b","200"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -n mycc -C ch1 -c '{"Args":["query","a"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n mycc -C ch1 -c '{"Args":["invoke","a","b","10"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -n mycc -C ch1 -c '{"Args":["query","a"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n mycc -C ch1 -c '{"Args":["query","a"]}'

CORE_PEER_ADDRESS=peer2:7051 peer chaincode install -n mycc -v v0 -p chaincode_example02
CORE_PEER_ADDRESS=peer2:7051 peer chaincode query -o orderer1:7050 -n mycc -C ch1 -c '{"Args":["query","a"]}'
CORE_PEER_ADDRESS=peer2:7051 peer chaincode invoke -o orderer1:7050 -n mycc -C ch1 -c '{"Args":["invoke","b","a","30"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -n mycc -C ch1 -c '{"Args":["query","a"]}'

################### couchdb ####################
peer channel create -o orderer1:7050 -c ch1
CORE_PEER_ADDRESS=peer1:7051 peer channel join -o orderer1:7050 -b ch1.block
CORE_PEER_ADDRESS=peer2:7051 peer channel join -o orderer1:7050 -b ch1.block


CORE_PEER_ADDRESS=peer1:7051 peer chaincode install -n marbles -v v0 -p marbles02
CORE_PEER_ADDRESS=peer2:7051 peer chaincode install -n marbles -v v0 -p marbles02
CORE_PEER_ADDRESS=peer1:7051 peer chaincode instantiate -o orderer1:7050  -v v0 -n marbles -C ch1 -c '{"Args":["init"]}'


CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["initMarble","marble1","blue","35","tom"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["initMarble","marble2","red","50","tom"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["initMarble","marble3","blue","70","tom"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["getMarblesByRange","marble1","marble3"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["transferMarble","marble2","jerry"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["transferMarblesBasedOnColor","blue","jerry"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["readMarble","marble1"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["delete","marble1"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["readMarble","marble1"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["getMarblesByRange","marble1","marble3"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -o orderer1:7050 -C ch1 -n marbles -c '{"Args":["getHistoryForMarble","marble1"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -C ch1 -n marbles -c '{"Args":["queryMarblesByOwner","jerry"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode query -C ch1 -n marbles -c '{"Args":["queryMarbles","{\"selector\":{\"owner\":\"jerry\"}}"]}'



################### msp ####################

peer channel create -f configtxgen_output/channel_tx.tx -o orderer1:7050 -c channel
export CORE_PEER_LOCALMSPID=MyOrg1MSP
export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/mymsp/crypto-config/peerOrganizations/peerOrg1/peers/peerOrg1Peer1
export CORE_PEER_ADDRESS=peer1:7051
peer channel join -b channel.block -o orderer1:7050
peer chaincode install -p marbles02 -n marbles -v v0

export CORE_PEER_LOCALMSPID=MyOrg2MSP
export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/mymsp/crypto-config/peerOrganizations/peerOrg2/peers/peerOrg2Peer1
export CORE_PEER_ADDRESS=peer2:7051
peer channel join -b channel.block -o orderer1:7050
peer chaincode install -p marbles02 -n marbles -v v0

peer chaincode instantiate -o orderer1:7050  -v v0 -n marbles -C channel -c '{"Args":["init"]}'
peer chaincode invoke -o orderer1:7050 -C channel -n marbles -c '{"Args":["initMarble","marble1","blue","35","tom"]}'
peer chaincode query -o orderer1:7050 -C channel -n marbles -c '{"Args":["readMarble","marble1"]}'

export CORE_PEER_LOCALMSPID=MyOrg1MSP
export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/mymsp/crypto-config/peerOrganizations/peerOrg1/peers/peerOrg1Peer1
export CORE_PEER_ADDRESS=peer1:7051

peer chaincode query -o orderer1:7050 -C channel -n marbles -c '{"Args":["getMarblesByRange","marble1","marble3"]}'


####################################################
peer channel create -o orderer1:7050 -c chtest
CORE_PEER_ADDRESS=peer1:7051 peer channel join -o orderer1:7050 -b chtest.block
CORE_PEER_ADDRESS=peer2:7051 peer channel join -o orderer1:7050 -b chtest.block

CORE_PEER_ADDRESS=peer1:7051 peer chaincode install -n test -v v0 -p test
CORE_PEER_ADDRESS=peer2:7051 peer chaincode install -n test -v v0 -p test

CORE_PEER_ADDRESS=peer1:7051 peer chaincode instantiate -o orderer1:7050  -v v0 -n test -C chtest -c '{"Args":["init"]}'


CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","d","ekey1"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","d","ekey2"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","deke","y3"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","dek","ey3"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","de","key3"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","de","key3","-1"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","de","key3","-1"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","de","key3","-2","-1"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["CreateCompositeKey","abc","de","key3","-2","-2"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetStateByPartialCompositeKey","abc"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetStateByPartialCompositeKey","abc","d"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetStateByPartialCompositeKey","abc","de"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetStateByPartialCompositeKey","abc","de","key3"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetStateByPartialCompositeKey","abc","de","key3","-2"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetState","abcdekey3"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["PutState","abcdekey3","Test"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["DelState","abcdekey3"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["PutState","abcdekey3","Test"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetHistoryForKey","abcdekey3"]}'

CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetQueryResult","{\"flag\":true}"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["PutState","json1","{\"shape\":\"square\",\"attributes\":{\"width\":5,\"length\":7}}"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["PutState","json2","{\"shape\":\"square\",\"attributes\":{\"width\":10,\"length\":7} ,\"name\":\"marble\" }"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetQueryResult","{\"name\":{\"$exists\":true} }"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetQueryResult","{\"attributes\":{ \"width\":{\"$lt\":10} } }"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetQueryResult","{\"$or\":[{\"attributes\":{ \"width\":{\"$lt\":10}}},{\"name\":{\"$exists\":true}}]}"]}'
CORE_PEER_ADDRESS=peer1:7051 peer chaincode invoke -o orderer1:7050 -n test -C chtest -c '{"Args":["GetQueryResult","{\"shape\":\"square\" }"]}'



# {
#     "$or":[
#         {
#             "attributes":{"width":{"$lt":10 } }
#         },
#         {
#             "name":{"$exists":true}
#         }
#     ]
# }
# http://docs.couchdb.org/en/2.0.0/api/database/find.html