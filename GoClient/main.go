package main

import (
	"./drp"
	"fmt"
	"github.com/gorilla/websocket"
)

func main() {
	myClient := &drp.Client{}

	// Connect to the Provider
	myClient.Open("ws://localhost:8080/provider")
	fmt.Println("Connected to Provider")
	
	// Register test command
	myClient.RegisterCmd("sayHi", func(drp.DRPCmdParams, *websocket.Conn, *string) interface{} { return "Hello there!" })

	// If we get a signal on the DoneChan, we need to exit
	done := <-myClient.DoneChan
	if done {
		fmt.Println("Closed with error")
	} else {
		fmt.Println("Closed gracefully")
	}
}
