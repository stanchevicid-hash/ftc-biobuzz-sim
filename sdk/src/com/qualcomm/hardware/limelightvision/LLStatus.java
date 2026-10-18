package com.qualcomm.hardware.limelightvision;

public class LLStatus {
    private final int pipeline;
    LLStatus(int pipeline) { this.pipeline = pipeline; }
    public double getCpu() { return 20; }
    public double getFps() { return 90; }
    public int getPipelineIndex() { return pipeline; }
    public String getPipelineType() { return "pipe_fiducial"; }
    public double getTemp() { return 45; }
    public String getName() { return "limelight"; }
    @Override public String toString() { return "LLStatus{pipeline=" + pipeline + "}"; }
}
