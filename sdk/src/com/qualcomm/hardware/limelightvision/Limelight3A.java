package com.qualcomm.hardware.limelightvision;

import ftcsim.Json;
import ftcsim.Sim;
import ftcsim.SimDevice;

import java.util.Map;

/** Simulated Limelight 3A: AprilTag (fiducial) pipeline only. Results come from the browser's camera model. */
public class Limelight3A extends SimDevice {
    private volatile boolean running; private volatile int pipeline; private int pollHz = 100;
    public Limelight3A(String name) { super(name); }
    public synchronized void start() { running = true; }
    public synchronized void pause() { running = false; }
    public synchronized void stop() { running = false; }
    public boolean isRunning() { return running; }
    public synchronized void setPollRateHz(int rateHz) { pollHz = rateHz; }
    public long getTimeSinceLastUpdate() { return 10; }
    public boolean isConnected() { return true; }
    public LLResult getLatestResult() {
        if (!running) return null;
        Map<String, Object> m = Sim.dev("limelight", name);
        return new LLResult(m, pipeline);
    }
    public LLStatus getStatus() { return new LLStatus(pipeline); }
    public boolean reloadPipeline() { return true; }
    public boolean pipelineSwitch(int index) { pipeline = index; return true; }
    public boolean captureSnapshot(String snapname) { return true; }
    public boolean deleteSnapshots() { return true; }
    public boolean deleteSnapshot(String snapname) { return true; }
    public boolean updatePythonInputs(double... inputs) { return true; }
    public boolean updatePythonInputs(double[] inputs, boolean unused) { return true; }
    public boolean updateRobotOrientation(double yaw) { return true; }
    public boolean uploadPipeline(String jsonString, Integer index) { return true; }
    public boolean uploadPython(String pythonString, Integer index) { return true; }
    public void shutdown() { running = false; }
    @Override public String getDeviceName() { return "Limelight 3A (sim)"; }
}
