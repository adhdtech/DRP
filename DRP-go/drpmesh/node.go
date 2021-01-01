package drpmesh

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

// CreateNode instantiates and returns a new node
func CreateNode(nodeRoles []string, hostID string, domainName string, meshKey string, zone string, scope string, listeningName *string, webServerConfig interface{}, drpRoute *string, debug bool) *Node {
	nodeHostname, _ := os.Hostname()
	nodePID := os.Getpid()

	newNode := &Node{}
	newNode.nodeRoles = nodeRoles
	newNode.hostID = hostID
	newNode.domainName = domainName
	newNode.meshKey = meshKey
	newNode.Zone = zone
	newNode.Scope = &scope
	newNode.listeningName = listeningName
	newNode.webServerConfig = webServerConfig
	newNode.drpRoute = drpRoute
	newNode.NodeID = fmt.Sprintf("%s-%d", nodeHostname, nodePID)
	newNode.Debug = debug
	newNode.ConnectedToControlPlane = false
	newNode.HasConnectedToMesh = false

	newNode.NodeDeclaration = &NodeDeclaration{newNode.NodeID, newNode.nodeRoles, newNode.hostID, newNode.listeningName, newNode.domainName, newNode.meshKey, newNode.Zone, newNode.Scope}

	newNode.NodeEndpoints = make(map[string]EndpointInterface)
	newNode.Services = make(map[string]Service)
	newNode.TopologyTracker = &TopologyTracker{}
	newNode.TopologyTracker.Initialize(newNode)

	var localDRPEndpoint = &Endpoint{}
	localDRPEndpoint.Init()
	newNode.ApplyNodeEndpointMethods(localDRPEndpoint)
	var DRPService = Service{"DRP", newNode, "DRP", "", false, 10, 10, newNode.Zone, "local", []string{}, []string{}, 1, localDRPEndpoint.EndpointCmds, nil}
	newNode.AddService(DRPService)

	return newNode
}

// NodeDeclaration objects are traded between Node Endpoints, currently used for mesh auth
type NodeDeclaration struct {
	NodeID     string
	NodeRoles  []string
	HostID     string
	NodeURL    *string
	DomainName string
	MeshKey    string
	Zone       string
	Scope      *string
}

// Node is the base object for DRP operations; service and endpoints are bound to this
type Node struct {
	hostID                  string
	NodeID                  string
	domainName              string
	meshKey                 string
	Zone                    string
	Scope                   *string
	webServerConfig         interface{}
	listeningName           *string
	drpRoute                *string
	nodeRoles               []string
	NodeDeclaration         *NodeDeclaration
	Services                map[string]Service
	TopicManager            interface{}
	TopologyTracker         *TopologyTracker
	NodeEndpoints           map[string]EndpointInterface
	Debug                   bool
	ConnectedToControlPlane bool
	HasConnectedToMesh      bool
	onControlPlaneConnect   *func()
}

// Log data to console using standard format
func (dn *Node) Log(logMessage string, isDebugMsg bool) {
	if isDebugMsg && !dn.Debug {
		return
	}
	timestamp := dn.GetTimestamp()
	fmt.Printf("%s [%14s] -> %s\n", timestamp, dn.NodeID, logMessage)
}

// GetTimestamp returns the timestamp in a fixed format
func (dn *Node) GetTimestamp() string {
	t := time.Now()
	timestamp := t.Format("20060102150405")
	return timestamp
}

/*
TO DO - IMPLEMENT THESE FUNCTIONS
GetConsumerToken
GetLastTokenForUser
EnableREST
AddSwaggerRouter
ListClassInstances
GetServiceDefinition
GetServiceDefinitions
GetLocalServiceDefinitions
GetClassRecords
SendPathCmdToNode
GetBaseObj
FindProvidersForStream
EvalPath
GetObjFromPath
VerifyNodeConnection
VerifyConsumerConnection
*/

// ServiceCmd is used to execute a command against a local or remote Service
// TO DO - IMPLEMENT
func (dn *Node) ServiceCmd(serviceName string, method string, params interface{}, targetNodeID *string, targetServiceInstanceID *string, useControlPlane bool, awaitResponse bool, callingEndpoint interface{}) error {
	return nil
}

// RegistryClientHandler handles connection logic when making an outbound connection to a Registry Node
func (dn *Node) RegistryClientHandler(nodeClient *Client) {
	thisNode := dn
	// Get peer info
	getDeclarationResponse := nodeClient.SendCmdAwait("DRP", "getNodeDeclaration", nil)
	remoteNodeDeclaration := &NodeDeclaration{}
	if getDeclarationResponse != nil && getDeclarationResponse.Payload != nil {
		err := json.Unmarshal(*getDeclarationResponse.Payload, remoteNodeDeclaration)
		if err != nil {
			thisNode.Log(fmt.Sprintf("RegistryClientHandler Payload unmarshal error: %s", err), false)
			return
		}
		registryNodeID := remoteNodeDeclaration.NodeID
		nodeClient.EndpointID = &registryNodeID
		thisNode.NodeEndpoints[registryNodeID] = nodeClient
	} else {
		return
	}

	// Get Registry
	thisNode.TopologyTracker.ProcessNodeConnect(nodeClient, remoteNodeDeclaration, false)
}

// ConnectToRegistry attempts a connection to a specific Registry Node URL
func (dn *Node) ConnectToRegistry(registryURL string, openCallback *func(), closeCallback *func()) {
	retryOnClose := true
	newRegistryClient := &Client{}
	regClientOpenCallback := func() {
		dn.RegistryClientHandler(newRegistryClient)
		if openCallback != nil {
			(*openCallback)()
		}
	}
	if closeCallback != nil {
		retryOnClose = false
	}
	newRegistryClient.Connect(registryURL, nil, dn, nil, retryOnClose, &regClientOpenCallback, closeCallback)
}

// ConnectToBroker attempts a connection to a specific Registry Node URL
/*
func (dn *Node) ConnectToBroker(wsTarget string, proxy *string) *Client {
	newBrokerClient := &Client{}
	newBrokerClient.Connect(wsTarget, proxy, dn, "someEndpointID", "Broker")
	return newBrokerClient
}
*/

// AddService registers a new Service object to the local Node
func (dn *Node) AddService(serviceObj Service) {
	thisNode := dn

	newInstanceID := fmt.Sprintf("%s-%s-%d", dn.NodeID, serviceObj.ServiceName, rand.Intn(9999))
	serviceObj.InstanceID = newInstanceID

	thisNode.Services[serviceObj.ServiceName] = serviceObj

	newServiceEntry := ServiceTableEntry{}
	newServiceEntry.NodeID = &thisNode.NodeID
	newServiceEntry.ProxyNodeID = nil
	newServiceEntry.Scope = &serviceObj.Scope
	newServiceEntry.Zone = &serviceObj.Zone
	newServiceEntry.LearnedFrom = nil
	newServiceEntry.LastModified = nil
	newServiceEntry.Name = &serviceObj.ServiceName
	newServiceEntry.Type = &serviceObj.Type
	newServiceEntry.InstanceID = &serviceObj.InstanceID
	newServiceEntry.Sticky = serviceObj.Sticky
	newServiceEntry.Priority = serviceObj.Priority
	newServiceEntry.Weight = serviceObj.Weight
	newServiceEntry.Dependencies = serviceObj.Dependencies
	newServiceEntry.Streams = serviceObj.Streams
	newServiceEntry.Status = serviceObj.Status

	addServicePacket := TopologyPacket{thisNode.NodeID, "add", "service", *newServiceEntry.InstanceID, *newServiceEntry.Scope, *newServiceEntry.Zone, newServiceEntry.ToJSON()}
	thisNode.TopologyTracker.ProcessPacket(addServicePacket, thisNode.NodeID, false)
}

// RemoveService TO DO - IMPLEMENT
func (dn *Node) RemoveService() {}

// ApplyGenericEndpointMethods applies a mandatory set of methods to an Endpoint
// TO DO - REGISTER METHODS AS FUNCTIONS ARE PORTED
func (dn *Node) ApplyGenericEndpointMethods(targetEndpoint EndpointInterface) {
	thisNode := dn
	//type EndpointMethod func(*CmdParams, *websocket.Conn, *int) interface{}
	targetEndpoint.RegisterMethod("getEndpointID", func(params *CmdParams, wsConn *websocket.Conn, token *int) interface{} {
		return targetEndpoint.GetID()
	})

	targetEndpoint.RegisterMethod("getNodeDeclaration", func(params *CmdParams, wsConn *websocket.Conn, token *int) interface{} {
		return thisNode.NodeDeclaration
	})
	/*
		targetEndpoint.RegisterMethod("pathCmd", async (params, srcEndpoint, token) => {
			return await thisNode.GetObjFromPath(params, thisNode.GetBaseObj(), srcEndpoint);
		});
	*/
	targetEndpoint.RegisterMethod("getRegistry", func(params *CmdParams, wsConn *websocket.Conn, token *int) interface{} {
		var reqNodeID *string = nil
		valueJSON := (*params)["reqNodeID"]
		if valueJSON != nil {
			json.Unmarshal(*valueJSON, reqNodeID)
		}
		return thisNode.TopologyTracker.GetRegistry(reqNodeID)
	})
	/*
		targetEndpoint.RegisterMethod("getServiceDefinition", (...args) => {
			return thisNode.GetServiceDefinition(...args);
		});

		targetEndpoint.RegisterMethod("getServiceDefinitions", async function (...args) {
			return await thisNode.GetServiceDefinitions(...args);
		});

		targetEndpoint.RegisterMethod("getLocalServiceDefinitions", function (...args) {
			return thisNode.GetLocalServiceDefinitions(...args);
		});

		targetEndpoint.RegisterMethod("getClassRecords", async (...args) => {
			return await thisNode.GetClassRecords(...args);
		});

		targetEndpoint.RegisterMethod("listClassInstances", async (...args) => {
			return await thisNode.ListClassInstances(...args);
		});

		targetEndpoint.RegisterMethod("sendToTopic", function (params, srcEndpoint, token) {
			thisNode.TopicManager.SendToTopic(params.topicName, params.topicData);
		});

		targetEndpoint.RegisterMethod("getTopology", async function (...args) {
			return await thisNode.GetTopology(...args);
		});

		targetEndpoint.RegisterMethod("listClientConnections", function (...args) {
			return thisNode.ListClientConnections(...args);
		});

		targetEndpoint.RegisterMethod("tcpPing", async (...args) => {
			return thisNode.TCPPing(...args);
		});

		targetEndpoint.RegisterMethod("findInstanceOfService", async (params) => {
			return thisNode.TopologyTracker.FindInstanceOfService(params.serviceName, params.serviceType, params.zone);
		});

		targetEndpoint.RegisterMethod("listServices", async (params) => {
			return thisNode.TopologyTracker.ListServices(params.serviceName, params.serviceType, params.zone);
		});

		targetEndpoint.RegisterMethod("subscribe", async function (params, srcEndpoint, token) {
			// Only allow if the scope is local or this Node is a Broker
			if (params.scope !== "local" && !thisNode.IsBroker()) return null;

			let sendFunction = async (message) => {
				// Returns send status; error if not null
				return await srcEndpoint.SendReply(params.streamToken, 2, message);
			};
			let sendFailCallback = async (sendFailMsg) => {
				// Failed to send; may have already disconnected, take no further action
			};
			let thisSubscription = new DRP_Subscriber(params.topicName, params.scope, params.filter, sendFunction, sendFailCallback);
			srcEndpoint.Subscriptions[params.streamToken] = thisSubscription;
			return await thisNode.Subscribe(thisSubscription);
		});

		targetEndpoint.RegisterMethod("unsubscribe", async function (params, srcEndpoint, token) {
			let response = false;
			let thisSubscription = srcEndpoint.Subscriptions[params.streamToken];
			if (thisSubscription) {
				thisSubscription.Terminate();
				thisNode.SubscriptionManager.Subscribers.delete(thisSubscription);
				response = true;
			}
			return response;
		});

		targetEndpoint.RegisterMethod("refreshSwaggerRouter", async function (params, srcEndpoint, token) {
			let serviceName = null;
			if (params && params.serviceName) {
				// params was passed from cliGetPath
				serviceName = params.serviceName;

			} else if (params && params.pathList && params.pathList.length > 0) {
				// params was passed from cliGetPath
				serviceName = params.pathList.shift();
			} else {
				if (params && params.pathList) return `Format \\refreshSwaggerRouter\\{serviceName}`;
				else return `FAIL - serviceName not defined`;
			}

			if (thisNode.SwaggerRouters[serviceName]) {
				delete thisNode.SwaggerRouters[serviceName];
				let serviceInstance = thisNode.TopologyTracker.FindInstanceOfService(serviceName);
				if (!serviceInstance) return `FAIL - Service [${serviceName}] does not exist`;
				await thisNode.AddSwaggerRouter(serviceName, serviceInstance.NodeID);
				return `OK - Refreshed SwaggerRouters[${serviceName}]`;
			} else {
				return `FAIL - SwaggerRouters[${serviceName}] does not exist`;
			}
		});
	*/
}

// ApplyNodeEndpointMethods applies a set of methods to an Endpoint if the peer is a Node
// TO DO - REGISTER METHODS AS FUNCTIONS ARE PORTED
func (dn *Node) ApplyNodeEndpointMethods(targetEndpoint EndpointInterface) {
	thisNode := dn

	thisNode.ApplyGenericEndpointMethods(targetEndpoint)
	/*
		targetEndpoint.RegisterMethod("topologyUpdate", async function (...args) {
			return thisNode.TopologyUpdate(...args);
		});

		targetEndpoint.RegisterMethod("connectToNode", async function (...args) {
			return await thisNode.ConnectToNode(...args);
		});

		targetEndpoint.RegisterMethod("addConsumerToken", async function (params, srcEndpoint, token) {
			if (params.tokenPacket) {
				thisNode.ConsumerTokens[params.tokenPacket.Token] = params.tokenPacket;
			}
			return;
		});

		if (targetEndpoint.IsServer && !targetEndpoint.IsServer()) {
			// Add this command for DRP_Client endpoints
			targetEndpoint.RegisterMethod("connectToRegistryInList", async function (...args) {
				return await thisNode.ConnectToRegistryInList(...args);
			});
		}
	*/
}

// RawMessageToString converts a json.RawMessage ([]byte) to a string for debug output
func (dn *Node) RawMessageToString(rawMessage *json.RawMessage) *string {
	j, err := json.Marshal(rawMessage)
	if err != nil {
		return nil
	}
	jsonString := string(j)
	return &jsonString
}

// IsRegistry tells whether or not the local Node holds the Registry role
func (dn *Node) IsRegistry() bool {
	for _, a := range dn.nodeRoles {
		if a == "Registry" {
			return true
		}
	}
	return false
}

// IsBroker tells whether or not the local Node hold the Broker role
func (dn *Node) IsBroker() bool {
	for _, a := range dn.nodeRoles {
		if a == "Broker" {
			return true
		}
	}
	return false
}
