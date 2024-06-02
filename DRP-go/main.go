package main

import (
	"fmt"
	"os"

	"adhdtech/drpmesh/drpmesh"
)

type TestService struct {
	drpmesh.Service
}

func main() {
	fmt.Println("Test DRP_Node Instantiation:")
	//listeningName := "ws://somehost.domain.com:8080"
	nodeHostname, _ := os.Hostname()
	ThisNode := drpmesh.CreateNode([]string{"Provider"}, nodeHostname, "mydomain.xyz", "asdfasdf", "MyZone", "global", nil, nil, nil, true)
	ThisNode.Log("Node created", false)
	//fmt.Printf("%+v\n", thisNode)
	//thisNode.ConnectToBroker("ws://localhost:8080", nil)

	/*
		thisNodeID := &thisNode.NodeID
		var results = thisNode.TopologyTracker.GetRegistry(thisNodeID)

		var resultsBytes, _ = json.Marshal(results)
		fmt.Printf("%s\n", string(resultsBytes))
	*/
	ThisNode.ConnectToRegistry("ws://localhost:8080", nil, nil)

	TestService2 := &drpmesh.Service{ServiceName: "TestService2", DRPNode: ThisNode, Type: "TestService2", InstanceID: "", Sticky: false, Priority: 10, Weight: 10, Zone: ThisNode.Zone, Scope: "global", Dependencies: []string{}, Streams: []string{}, Status: 1, ClientCmds: make(map[string]drpmesh.EndpointMethod), Classes: nil}
	TestService2.ClientCmds = make(map[string]drpmesh.EndpointMethod)
	TestService2.ClientCmds["testFunc1"] = func(params *drpmesh.CmdParams, callingEndpoint drpmesh.EndpointInterface, token *int) interface{} {
		return "A static response"
	}

	ThisNode.AddService(*TestService2)

	//thisNode.ConnectToMesh()

	//servicesWithProviders := thisNode.TopologyTracker.GetServicesWithProviders()
	//var resultsBytes, _ = json.Marshal(servicesWithProviders)
	//fmt.Printf("%s\n", string(resultsBytes))

	//drpServiceDef := thisNode.Services["DRP"].GetDefinition()
	//var resultsBytes, _ = json.Marshal(drpServiceDef)
	//fmt.Printf("%s\n", string(resultsBytes))

	//serviceCmdResponse := thisNode.ServiceCmd("DocMgr", "listServices", nil, nil, nil, true, true, nil)
	//var resultsBytes, _ = json.Marshal(serviceCmdResponse)
	//fmt.Printf("%s\n", string(resultsBytes))

	//serviceName := "DocMgr"
	//bestServiceTableEntry := thisNode.TopologyTracker.FindInstanceOfService(&serviceName, nil, nil, nil)
	//var resultsBytes, _ = json.Marshal(bestServiceTableEntry)
	//fmt.Printf("%s\n", string(resultsBytes))

	doneChan := make(chan bool)
	_ = <-doneChan
	//fmt.Printf("%+v\n", results)
}
