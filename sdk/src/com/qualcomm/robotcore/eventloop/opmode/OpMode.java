package com.qualcomm.robotcore.eventloop.opmode;

import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import ftcsim.Sim;
import ftcsim.SimTelemetry;
import org.firstinspires.ftc.robotcore.external.Telemetry;

import java.util.HashMap;

public abstract class OpMode {
    public static final HashMap<String, Object> blackboard = new HashMap<String, Object>();
    public Gamepad gamepad1 = null;
    public Gamepad gamepad2 = null;
    public Telemetry telemetry = new SimTelemetry();
    public HardwareMap hardwareMap = null;
    public volatile double time = 0.0;
    @Deprecated public int msStuckDetectInit = 5000;
    @Deprecated public int msStuckDetectInitLoop = 5000;
    @Deprecated public int msStuckDetectStart = 5000;
    @Deprecated public int msStuckDetectLoop = 5000;
    @Deprecated public int msStuckDetectStop = 900;
    private double startTime = 0.0;

    public OpMode() { startTime = Sim.time; }

    public abstract void init();
    public void init_loop() {}
    public void start() {}
    public abstract void loop();
    public void stop() {}

    public final void requestOpModeStop() { Sim.stopRequested = true; }
    public final void terminateOpModeNow() { Sim.stopRequested = true; throw new ftcsim.OpModeTerminated(); }
    public double getRuntime() { return Sim.time - startTime; }
    public void resetRuntime() { startTime = Sim.time; }
    public void updateTelemetry(Telemetry telemetry) { telemetry.update(); }

    /** used by the simulator runner */
    public void simAttach(HardwareMap hw) {
        hardwareMap = hw; gamepad1 = Sim.gamepads[0]; gamepad2 = Sim.gamepads[1]; startTime = Sim.time;
    }
    public void simTick() { time = getRuntime(); }

    @Deprecated public void internalPreInit() {}
    @Deprecated public void internalPostInitLoop() {}
    @Deprecated public void internalPostLoop() {}
}
