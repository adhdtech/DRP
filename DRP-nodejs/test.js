const ErrTypes = {
    NOTEXIST: 1,
    ERROREXEC: 2,
    OTHER: 3
}

class CmdError extends Error {
    /**
     * Command Error
     * @param {any} message
     * @param {number} code
     * @param {string} source
     */
    constructor(message, code, source) {
        super(message);
        this.name = "CmdError";
        this.code = code
        this.source = source
    }
}

function test() {
    throw new CmdError("Does not exist", ErrTypes.NOTEXIST, "MyNode.ServiceName")
}

(async () => {
    try {
        test()
    } catch (ex) {
		let someException = ex
	}
})();