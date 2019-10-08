package main

import (
	"./drp"
	"fmt"
	"github.com/gorilla/websocket"
)

func GetPublicInterface(params drp.DRPCmdParams, wsConn *websocket.Conn, replyToken *string) interface{} {
	return "eth0"
}

func main() {
	storebotclient := &drp.Client{}

	// Connect to the Provider
	storebotclient.Open("wss://rsage.autozone.com/provider")
	fmt.Println("Connected to Provider")

	// Register as Storebot agent
	responseData := storebotclient.SendCmdAwait("registerStore", drp.DRPCmdParams{"storeNum": "0094"})

	if registerSuccess, ok := responseData.Payload.(bool); ok && registerSuccess {
		fmt.Println("Registered agent")
	} else {
		fmt.Println("Registration failed")
	}

	// Register getPublicInterface command
	storebotclient.RegisterCmd("getPublicInterface", GetPublicInterface)

	// If we get a signal on the DoneChan, we need to exit
	done := <-storebotclient.DoneChan
	if done {
		fmt.Println("Closed with error")
	} else {
		fmt.Println("Closed gracefully")
	}
}
