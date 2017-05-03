package main

import (
	"fmt"
	"math/rand"
	"strconv"

	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

type SimpleChaincode struct {
}

func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}

func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface) pb.Response {
	fmt.Println("Init")
	return shim.Success(nil)
}

func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface) pb.Response {
	function, args := stub.GetFunctionAndParameters()
	fmt.Println("invoke is running " + function)

	switch function {
	case "PutState":
		return t.testPutState(stub, args)

	case "GetState":
		return t.testGetState(stub, args)

	case "DelState":
		return t.testDelState(stub, args)

	case "CreateCompositeKey":
		return t.testCreateCompositeKey(stub, args)

	case "GetStateByPartialCompositeKey":
		return t.testGetStateByPartialCompositeKey(stub, args)

	case "GetHistoryForKey":
		return t.testGetHistoryForKey(stub, args)

	case "GetQueryResult":
		return t.testGetQueryResult(stub, args)

	}

	return shim.Error("Received unknown function invocation")

}

func (t *SimpleChaincode) testCreateCompositeKey(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var strarr []string
	for _, val := range args[1:] {
		strarr = append(strarr, val)
	}
	fmt.Printf("=>Index:%v,Value:%v\n", args[0], strarr)
	Key, err := stub.CreateCompositeKey(args[0], strarr)
	if err != nil {
		fmt.Printf("Error:%v\n", err.Error())
		return shim.Error(err.Error())
	}
	random := rand.Int()
	value := "{ \"flag\":true,\"random\":" + strconv.Itoa(random) + "}"
	fmt.Printf("=>CompositeKey:%v  ,Value:%s\n", Key, value)
	stub.PutState(Key, []byte(value)) //[]byte{0x00}

	fmt.Printf("^^^^Finish CreateCompositeKey Function^^^^\n")
	return shim.Success([]byte("^^^^Finish CreateCompositeKey Function^^^^\n"))

}
func (t *SimpleChaincode) testGetStateByPartialCompositeKey(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	var strarr []string
	for _, val := range args[1:] {
		strarr = append(strarr, val)
	}
	fmt.Printf("=>Index:%v  ,Value:%v\n", args[0], strarr)
	ResultsIterator, err := stub.GetStateByPartialCompositeKey(args[0], strarr)
	if err != nil {
		fmt.Printf("Error:%v\n", err.Error())
		return shim.Error(err.Error())
	}
	fmt.Printf("======= Loop Start =======\n")
	for ResultsIterator.HasNext() {
		ledgerkv, err := ResultsIterator.Next()
		if err != nil {
			fmt.Printf("Error:%v\n", err.Error())
			return shim.Error(err.Error())
		}
		defer ResultsIterator.Close()
		fmt.Printf("=>ledger.KV:%v\n  Key:%v  ,Value:%s\n", ledgerkv, ledgerkv.Key, string(ledgerkv.Value))
		indexKey, compositeKeyParts, err := stub.SplitCompositeKey(ledgerkv.Key)
		if err != nil {
			fmt.Printf("Error:%v", err.Error())
			return shim.Error(err.Error())
		}
		fmt.Printf("=>IndexKey:%v  ,CompositeKeyParts:%v\n", indexKey, compositeKeyParts)
		var temp = ""
		for _, value := range compositeKeyParts {
			temp += value
		}
		value, err := stub.GetState(indexKey + temp)
		if err != nil {
			fmt.Printf("Error:%v\n", err.Error())
			return shim.Error(err.Error())
		}
		fmt.Printf("=>GetState:%s\n", string(value))

	}
	ResultsIterator.Close()
	fmt.Printf("======= Loop   End =======\n")
	fmt.Printf("^^^^Finish GetStateByPartialCompositeKey Function^^^^\n")
	return shim.Success([]byte("^^^^Finish GetStateByPartialCompositeKey Function^^^^"))
}
func (t *SimpleChaincode) testGetState(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	value, err := stub.GetState(args[0])
	if err != nil {
		fmt.Printf("Error:%v\n", err.Error())
		return shim.Error(err.Error())
	}
	fmt.Printf("=>GetState:%s\n", string(value))
	fmt.Printf("^^^^Finish GetState Function^^^^\n")
	return shim.Success([]byte("^^^^Finish GetState Function^^^^"))
}
func (t *SimpleChaincode) testDelState(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	err := stub.DelState(args[0])
	if err != nil {
		fmt.Printf("Error:%v\n", err.Error())
		return shim.Error(err.Error())
	}
	fmt.Printf("^^^^Finish DelState Function^^^^\n")
	return shim.Success([]byte("^^^^Finish DelState Function^^^^"))
}
func (t *SimpleChaincode) testPutState(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	err := stub.PutState(args[0], []byte(args[1]))
	if err != nil {
		fmt.Printf("Error:%v\n", err.Error())
		return shim.Error(err.Error())
	}
	fmt.Printf("PutState\n  Key:%s  ,Value:%s\n", args[0], args[1])
	fmt.Printf("^^^^Finish PutState Function^^^^\n")
	return shim.Success([]byte("^^^^Finish PutState Function^^^^"))
}
func (t *SimpleChaincode) testGetHistoryForKey(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	ResultsIterator, err := stub.GetHistoryForKey(args[0])

	if err != nil {
		fmt.Printf("Error:%v\n", err.Error())
		return shim.Error(err.Error())
	}
	fmt.Printf("======= Loop Start =======\n")
	for ResultsIterator.HasNext() {
		ledgerModification, err := ResultsIterator.Next()
		if err != nil {
			fmt.Printf("Error:%v\n", err.Error())
			return shim.Error(err.Error())
		}
		defer ResultsIterator.Close()

		fmt.Printf("=>ledger.Modification:%v\n"+
			"  Delete:%v\n"+
			"  Timestamp:%v\n"+
			"  TxID:%s\n"+
			"  Value:%s\n", ledgerModification, ledgerModification.IsDelete, ledgerModification.Timestamp, ledgerModification.TxID, string(ledgerModification.Value))
	}
	ResultsIterator.Close()
	fmt.Printf("======= Loop   End =======\n")
	fmt.Printf("^^^^Finish GetHistoryForKey Function^^^^\n")
	return shim.Success([]byte("^^^^Finish GetHistoryForKey Function^^^^"))
}

func (t *SimpleChaincode) testGetQueryResult(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	query := fmt.Sprintf("{\"selector\":%s}", args[0])
	ResultsIterator, err := stub.GetQueryResult(query)
	if err != nil {
		fmt.Printf("Error:%v\n", err.Error())
		return shim.Error(err.Error())
	}
	defer ResultsIterator.Close()
	fmt.Printf("======= Loop Start =======\n")
	for ResultsIterator.HasNext() {
		ledgerkv, err := ResultsIterator.Next()
		if err != nil {
			fmt.Printf("Error:%v\n", err.Error())
			return shim.Error(err.Error())
		}
		defer ResultsIterator.Close()
		fmt.Printf("=>ledger.KV:%v\n  Key:%v  ,Value:%s\n", ledgerkv, ledgerkv.Key, string(ledgerkv.Value))
	}
	ResultsIterator.Close()
	fmt.Printf("======= Loop   End =======\n")
	fmt.Printf("^^^^Finish GetQueryResult Function^^^^\n")
	return shim.Success([]byte("^^^^Finish GetQueryResult Function^^^^"))
}
