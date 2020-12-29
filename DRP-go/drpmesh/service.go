package drpmesh

// Service is used to define a DRP service
type Service struct {
	ServiceName  string
	drpNode      *Node
	Type         string
	InstanceID   string
	Sticky       bool
	Priority     int
	Weight       int
	Zone         string
	Scope        string
	Dependencies []string
	Streams      []string
	Status       int
	ClientCmds   map[string]EndpointMethod
	Classes      map[string]interface{}
}
