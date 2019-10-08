package drp

import (
	"crypto/tls"
	"encoding/json"
	"log"
	"strconv"

	"github.com/gorilla/websocket"
)

type DRPEndpointMethod func(DRPCmdParams, *websocket.Conn, *string) interface{}

type DRPCmdParams map[string]interface{}

// Endpoint - DRP endpoint
type Endpoint struct {
	EndpointCmds       map[string]DRPEndpointMethod
	ReplyHandlerQueue  map[string](chan DRPMsgIn)
	StreamHandlerQueue map[string](chan DRPMsgIn)
	TokenNum           int
	sendChan           chan interface{}
}

func (e *Endpoint) GetToken() string {
	returnToken := strconv.Itoa(e.TokenNum)
	e.TokenNum++
	return returnToken
}

func (e *Endpoint) AddReplyHandler() string {
	replyToken := e.GetToken()
	e.ReplyHandlerQueue[replyToken] = make(chan DRPMsgIn)
	return replyToken
}

func (e *Endpoint) DeleteReplyHandler() {
}

func (e *Endpoint) AddStreamHandler() {
}

func (e *Endpoint) DeleteStreamHandler() {
}

func (e *Endpoint) RegisterCmd(cmdName string, method DRPEndpointMethod) {
	e.EndpointCmds[cmdName] = method
}

// SendCmd
func (e *Endpoint) SendCmd(cmdName string, cmdParams DRPCmdParams) string {
	replyToken := e.AddReplyHandler()

	sendCmd := &DRPCmd{}
	sendCmd.Type = "cmd"
	sendCmd.Cmd = &cmdName
	sendCmd.Params = cmdParams
	sendCmd.ReplyToken = &replyToken
	e.sendChan <- *sendCmd
	return replyToken
}

// SendCmdAwait
func (e *Endpoint) SendCmdAwait(cmdName string, cmdParams DRPCmdParams) DRPMsgIn {
	replyToken := e.SendCmd(cmdName, cmdParams)
	responseData := <-e.ReplyHandlerQueue[replyToken]

	return responseData
}

// SendCmdSubscribe
func (e *Endpoint) SendCmdSubscribe(topicName string, returnChan *chan DRPMsgIn) {
	cmdParams := DRPCmdParams{"topicName": &topicName}
	//cmdParams["topicName"] = &topicName
	tokenID := e.GetToken()
	params := cmdParams
	cmdName := "subscribe"
	sendCmd := &DRPCmd{}
	sendCmd.Type = "cmd"
	sendCmd.ReplyToken = &tokenID
	sendCmd.Cmd = &cmdName
	sendCmd.Params = params

	// Queue response chan
	e.StreamHandlerQueue[tokenID] = make(chan DRPMsgIn)

	// Send cmd
	e.sendChan <- *sendCmd

	for {
		recvStruct := <-e.StreamHandlerQueue[tokenID]
		*returnChan <- recvStruct
	}

}

func (e *Endpoint) SendReply(wsConn *websocket.Conn, replyToken *string, returnStatus int, returnPayload interface{}) {
	replyCmd := &DRPReply{}
	replyCmd.Type = "reply"
	replyCmd.Token = replyToken
	replyCmd.Status = returnStatus
	replyCmd.Payload = returnPayload
	e.sendChan <- *replyCmd
}

func (e *Endpoint) SendStream() {
}

func (e *Endpoint) ProcessCmd(wsConn *websocket.Conn, msgIn DRPMsgIn) {
	cmdResults := make(map[string]interface{})
	cmdResults["status"] = 0
	cmdResults["output"] = nil
	if _, ok := e.EndpointCmds[*msgIn.Cmd]; ok {
		// Execute command
		cmdResults["output"] = e.EndpointCmds[*msgIn.Cmd](msgIn.Params, wsConn, msgIn.ReplyToken)
		cmdResults["status"] = 1
	} else {
		cmdResults["output"] = "StoreBot does not have this method"
	}
	e.SendReply(wsConn, msgIn.ReplyToken, cmdResults["status"].(int), cmdResults["output"])
}

func (e *Endpoint) ProcessReply(msgIn DRPMsgIn) {
	e.ReplyHandlerQueue[*msgIn.Token] <- msgIn

	// Add logic to delete from handler queue!
	delete(e.ReplyHandlerQueue, *msgIn.Token)
}

func (e *Endpoint) ProcessStream(msgIn DRPMsgIn) {
}

func (e *Endpoint) ReceiveMessage(wsConn *websocket.Conn, msgIn DRPMsgIn) {
	switch msgIn.Type {
	case "cmd":
		e.ProcessCmd(wsConn, msgIn)
	case "reply":
		e.ProcessReply(msgIn)
	case "stream":
		e.ProcessStream(msgIn)
	}
}

func (e *Endpoint) GetCmds(DRPCmdParams, *websocket.Conn, *string) interface{} {
	keys := make([]string, 0)
	for key := range e.EndpointCmds {
		keys = append(keys, key)
	}
	return keys
}

func (e *Endpoint) OpenHandler() {
	//fmt.Println("This is the OpenHandler")
}

func (e *Endpoint) CloseHandler() {
}

func (e *Endpoint) ErrorHandler() {
}

// DRP Client
type Client struct {
	Endpoint
	wsTarget string
	wsConn   *websocket.Conn
	DoneChan chan bool
}

// Open - Establish session
func (dc *Client) Open(wsTarget string) error {
	dc.EndpointCmds = make(map[string]DRPEndpointMethod)
	dc.ReplyHandlerQueue = make(map[string](chan DRPMsgIn))
	dc.StreamHandlerQueue = make(map[string](chan DRPMsgIn))
	dc.DoneChan = make(chan bool)
	dc.sendChan = make(chan interface{}, 100)
	dc.TokenNum = 1
	dc.wsTarget = wsTarget

	log.Printf("connecting to %s", dc.wsTarget)

	// Bypass web proxy
	var dialer = websocket.Dialer{
		Subprotocols:     []string{"drp"},
		Proxy: nil,
	}

	// Disable TLS Checking - need to address before production!
	dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}

	//w, _, err := websocket.DefaultDialer.Dial(w.wsTarget, nil)
	w, _, err := dialer.Dial(dc.wsTarget, nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	//defer w.Close()
	dc.wsConn = w

	done := make(chan struct{})

	dc.RegisterCmd("getCmds", dc.GetCmds)

	// Output Loop
	go func() {
		for {
			select {
			case <-done:
				return
			case sendCmd := <-dc.sendChan:
				sendBytes, marshalErr := json.Marshal(sendCmd)
				if marshalErr != nil {
					log.Println("error marshalling json:", marshalErr)
					//return marshalErr
				} else {
					wsSendErr := w.WriteMessage(websocket.TextMessage, sendBytes)
					if wsSendErr != nil {
						log.Println("error writing message to WS channel:", wsSendErr)
						//return wsSendErr
					}
				}

			}
		}
	}()

	// Input Loop
	go func() {
		for {
			inputJSON := DRPMsgIn{}
			err := dc.wsConn.ReadJSON(&inputJSON)
			if err != nil {
				log.Println("WSCLIENT - Could not parse JSON cmd: ", err)
			} else {
				dc.ReceiveMessage(dc.wsConn, inputJSON)
			}
		}
	}()

	// Execute OnOpen
	dc.OpenHandler()

	return nil
}

type DRPMsgIn struct {
	Type       string       `json:"type"`
	Cmd        *string      `json:"cmd"`
	Params     DRPCmdParams `json:"params"`
	Token      *string      `json:"token"`
	ReplyToken *string      `json:"replytoken"`
	Status     int          `json:"status"`
	Payload    interface{}  `json:"payload"`
}

type DRPMsg struct {
	Type string `json:"type"`
}

type DRPCmd struct {
	DRPMsg
	Cmd        *string      `json:"cmd"`
	Params     DRPCmdParams `json:"params"`
	ReplyToken *string      `json:"replytoken"`
}

type DRPReply struct {
	DRPMsg
	Token   *string     `json:"token"`
	Status  int         `json:"status"`
	Payload interface{} `json:"payload"`
}

type DRPStream struct {
	DRPMsg
	Token   *string `json:"token"`
	Status  int     `json:"status"`
	Payload *string `json:"payload"`
}
