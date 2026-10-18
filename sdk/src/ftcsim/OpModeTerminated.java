package ftcsim;

/** Thrown by terminateOpModeNow(); the runner treats it as a normal stop. */
public class OpModeTerminated extends RuntimeException {
    public OpModeTerminated() { super("OpMode terminated"); }
}
