build=false
make=true
profile="notfound"
channelID="lilicoco"
tx="the"
block="the"
configtx="configtx.yaml"
makemsp=false
ordererNodes=1
peerOrgUsers=1
peerOrgs=2
peersPerOrg=1
dir=configtxgen_output
helpme() {
    echo "                  -build                      go build 編譯工具 configtxgen,crptogen"
    echo "          -c      -channelID                  configtxgen 設定通道ID"
    echo "          -C      -config                     configtxgen 設定所用configtx.yaml"
    echo "          -p      -profile                    configtxgen 設定profile"
    echo "          -b      -block                      configtxgen輸出 .block 檔名"
    echo "          -t      -tx                         configtxgen輸出 .tx 檔名"
    echo "                  -dir                        cyptogen 製造msp目錄"
    echo "                  -orderers                   (Default 1)cyptogen orderer數"
    echo "                  -orgs                       (Default 2)cyptogen 組織數"
    echo "                  -peersPerOrg                (Default 1)cyptogen 每個組織多少peer"
    echo "                  -users                      (Default 1)cyptogen user數"
}
while [[ $# -gt 0 ]]
do
    key="$1"
    case $key in
        -build|--build)
            build=true
            make=false
        ;;
        -dir|--dir)
            dir=$2
            makemsp=true
            make=false
            shift
        ;;
        -orderers|--orderers)
            ordererNodes=$2
            shift
        ;;
        -users|--users)
            peerOrgUsers=$2
            shift
        ;;
        -orgs|--orgs)
            peerOrgs=$2
            shift
        ;;
        -peersPerOrg|--peersPerOrg)
            peersPerOrg=$2
            shift
        ;;
        -profile|--profile|-p)
            profile=$2
            shift
        ;;
        -channelID|--channelID|-c)
            channelID=$2
            shift
        ;;
        -tx|--tx|-t)
            tx=$2
            shift
        ;;
        -block|--block|-b)
            block=$2
            shift
        ;;
        -config|--config|-C)
            configtx=$2
            shift
        ;;
        -help|--help|-h)
            helpme
            exit 1;
        ;;
        *)
            helpme
            echo "args error"
            exit 1
        ;;
    esac
    shift
done

#build tool
if [[ $build == true ]]
then
rm configtxgen 2> /dev/null
cd $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtxgen
    go build
cd -
mv $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtxgen/configtxgen ./

rm cryptogen 2> /dev/null
cd $GOPATH/src/github.com/hyperledger/fabric/common/tools/cryptogen
    go build
cd -
mv $GOPATH/src/github.com/hyperledger/fabric/common/tools/cryptogen/cryptogen ./
fi

#make msp directory
if [[ $makemsp == true ]]
then
    ./cryptogen -baseDir $dir -ordererNodes $ordererNodes -peerOrgUsers $peerOrgUsers -peerOrgs $peerOrgs -peersPerOrg $peersPerOrg
fi

#make tx and block
if [[ $make == true ]]
then
    mv $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtx.yaml $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtx.yaml.orig
    cp $configtx $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtx.yaml

    ./configtxgen -profile $profile -outputBlock "$channelID"_"$block".block
    ./configtxgen -profile $profile -channelID $channelID -outputCreateChannelTx "$channelID"_"$tx".tx

    cp "$channelID"_* $dir/ 2> /dev/null
    mv "$channelID"_* configtxgen_output/ 2> /dev/null
    rm "$channelID"_* 2> /dev/null

    rm $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtx.yaml
    mv $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtx.yaml.orig $GOPATH/src/github.com/hyperledger/fabric/common/configtx/tool/configtx.yaml
fi
