package main

import (
	"fmt"
	"os"

	drp "./drpmesh"
)

func main() {
	fmt.Println("Test DRP_Node Instantiation:")
	//listeningName := "ws://somehost.domain.com:8080"
	nodeHostname, _ := os.Hostname()
	thisNode := drp.CreateNode([]string{"Provider"}, nodeHostname, "mydomain.xyz", "supersecretkey", "zone1", "global", nil, nil, nil, true)
	thisNode.Log("Node created", false)
	//fmt.Printf("%+v\n", thisNode)
	//thisNode.ConnectToBroker("ws://localhost:8080", nil)

	/*
		thisNodeID := &thisNode.NodeID
		var results = thisNode.TopologyTracker.GetRegistry(thisNodeID)

		var resultsBytes, _ = json.Marshal(results)
		fmt.Printf("%s\n", string(resultsBytes))
	*/
	thisNode.ConnectToRegistry("ws://localhost:8080", nil, nil)

	doneChan := make(chan bool)
	_ = <-doneChan
	//fmt.Printf("%+v\n", results)
}
