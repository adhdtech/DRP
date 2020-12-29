package drpmesh

import (
	"encoding/json"
)

// CreateCmd returns a Cmd object
func CreateCmd(method *string, params *CmdParams, serviceName *string, token *int, serviceInstanceID *string, routeOptions *RouteOptions) *Cmd {
	drpCmd := &Cmd{}
	drpCmd.Type = "cmd"
	drpCmd.RouteOptions = routeOptions
	drpCmd.Token = token
	drpCmd.Method = method
	drpCmd.Params = params
	drpCmd.ServiceName = serviceName
	drpCmd.ServiceInstanceID = serviceInstanceID
	return drpCmd
}

// CreateReply returns a Reply object
func CreateReply(status int, payload interface{}, token *int, routeOptions *RouteOptions) *Reply {
	drpReply := &Reply{}
	drpReply.Type = "reply"
	drpReply.RouteOptions = routeOptions
	drpReply.Token = token
	drpReply.Status = status
	drpReply.Payload = payload
	return drpReply
}

// Packet describes the base attributes of a DRP packet
type Packet struct {
	Type         string        `json:"type"`
	RouteOptions *RouteOptions `json:"routeOptions"`
	Token        *int          `json:"token"`
}

// Cmd is a DRP packet sent when issuing a command
type Cmd struct {
	Packet
	Method            *string    `json:"method"`
	Params            *CmdParams `json:"params"`
	ServiceName       *string    `json:"serviceName"`
	ServiceInstanceID *string    `json:"serviceInstanceID"`
}

// CmdParams - DRP Cmd parameters
type CmdParams map[string]*json.RawMessage

// ToJSON converts the packet to a JSON byte array
func (dc *Cmd) ToJSON() []byte {
	buff, _ := json.Marshal(dc)
	return buff
}

// CmdOut is a DRP packet sent when issuing a command
type CmdOut struct {
	Packet
	Method            *string     `json:"method"`
	Params            interface{} `json:"params"`
	ServiceName       *string     `json:"serviceName"`
	ServiceInstanceID *string     `json:"serviceInstanceID"`
}

// ToJSON converts the packet to a JSON byte array
func (dc *CmdOut) ToJSON() []byte {
	buff, _ := json.Marshal(dc)
	return buff
}

// Reply is a DRP packet sent when replying to a command
type Reply struct {
	Packet
	Status  int         `json:"status"`
	Payload interface{} `json:"payload"`
}

// ToJSON converts the packet to a JSON byte array
func (dr *Reply) ToJSON() []byte {
	buff, _ := json.Marshal(dr)
	return buff
}

// ReplyIn is used to unmarshal Reply packets we get back after sending a command
type ReplyIn struct {
	Packet
	Status  int              `json:"status"`
	Payload *json.RawMessage `json:"payload"`
}

// ToJSON converts the packet to a JSON byte array
func (dri *ReplyIn) ToJSON() []byte {
	buff, _ := json.Marshal(dri)
	return buff
}

// RouteOptions is an optional Packet parameter used to take advantage of control plane routing
type RouteOptions struct {
	SrcNodeID    *string  `json:"srcNodeID"`
	TgtNodeID    *string  `json:"tgtNodeID"`
	RouteHistory []string `json:"routeHistory"`
}
