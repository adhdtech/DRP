# DRPServices
Declarative Resource Protocol

# Overview
This goal of this project is to provide a vendor and language agnostic protocol for declaring and consuming infrastructure related data sources.

<div class="mermaid" style="height: 50em;">
sequenceDiagram
    participant Provider
    participant Registry
    participant Broker
    Note left of Provider: Startup
    Provider-->Registry: ws://&lt;regsvc&gt;/broker
    Broker->Registry: {cmd:"getDeclarations",replytoken:1}
    Note right of Registry: * Gather Declarations &lt;payload&gt;
    Registry->Broker: {token:1, data: {streams:["hostReport"]}}}
    Note left of Consumer: Startup
    Consumer-->Broker: ws://&lt;regsvc&gt;/consumer
    Consumer->Broker: {cmd:"observe", data:"hostReport", replytoken:1}
    Note right of Broker: * Register observation\n* Determine list of providers
    Broker-->Provider: ws://&lt;providersvc&gt;/broker
    Broker->Provider: {cmd:"subscribe", data:"hostReport", replytoken:123}
    Note right of Provider: Stream Data &lt;payload&gt;
    Provider->Broker: {token:123, data: &lt;payload&gt;}
    Note right of Broker: Relay to\nConsumers
    Broker->Consumer: {token:1,  data: &lt;payload&gt;}
</div>