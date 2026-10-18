package com.qualcomm.robotcore.eventloop.opmode;

import ftcsim.Sim;

public abstract class LinearOpMode extends OpMode {
    public abstract void runOpMode() throws InterruptedException;

    public void waitForStart() { while (!isStarted() && !isStopRequested()) { simTick(); Sim.barrier(); } }
    public final void idle() { simTick(); Sim.barrier(); }
    public final void sleep(long milliseconds) {
        long until = Sim.nanoTime() + milliseconds * 1000000L;
        while (Sim.nanoTime() < until && !Sim.stopRequested) {
            simTick(); Sim.barrier();
            if (Thread.currentThread().isInterrupted()) return;
        }
    }
    public final boolean opModeIsActive() {
        boolean active = !isStopRequested() && isStarted();
        if (active) idle();
        return active;
    }
    public final boolean opModeInInit() { boolean r = !isStarted() && !isStopRequested(); if (r) idle(); return r; }
    public final boolean isStarted() { return Sim.started || Thread.currentThread().isInterrupted(); }
    public final boolean isStopRequested() { return Sim.stopRequested || Thread.currentThread().isInterrupted(); }

    @Override public final void init() {}
    @Override public final void init_loop() {}
    @Override public final void start() {}
    @Override public final void loop() {}
    @Override public final void stop() {}
}
