請先建立好Hyperledger 環境\
Fabric版本 git checkout 7469e565f4\
run ./make
# 參數:
-b      -block                      configtxgen輸出 .block 檔名\
        -build                      go build 編譯工具 configtxgen,crptogen\
-c      -channelID                  configtxgen 設定通道ID\
        -config                     configtxgen 設定所用configtx.yaml\
-d      -dir                        cyptogen 製造msp目錄\
        -orderers                   cyptogen orderer數\
        -orgs                       cyptogen 組織數\
-p      -profile                    configtxgen 設定profile\
        -peersPerOrg                cyptogen 不太清楚這什麼\
-t      -tx                         configtxgen輸出 .tx 檔名\
        -users                      cyptogen user數

# 範例msp建立
./mspmake