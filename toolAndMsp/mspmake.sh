./make.sh -build
./make.sh -dir mymsp 
mkdir configtxgen_output 2> /dev/null
./make.sh -c channel -C mymsp.yaml -p MyTwoOrgs -b block -t tx

