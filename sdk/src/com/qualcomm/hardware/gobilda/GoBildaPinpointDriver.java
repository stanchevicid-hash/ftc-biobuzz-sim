package com.qualcomm.hardware.gobilda;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.hardware.I2cDeviceSynchSimple;
import ftcsim.Json;
import ftcsim.Sim;
import org.firstinspires.ftc.robotcore.external.navigation.*;

import java.util.Map;

/**
 * Simulated goBILDA Pinpoint. The physics gives the true field pose of the robot center and the travel of two
 * virtual dead-wheel pods; like the real device, position is integrated from those pods + the IMU heading.
 * Pod offsets (setOffsets) are honoured: wrong offsets produce drift when turning, just like on the real robot.
 */
public class GoBildaPinpointDriver implements HardwareDevice {
    public enum EncoderDirection { FORWARD, REVERSED }
    public enum GoBildaOdometryPods { goBILDA_SWINGARM_POD, goBILDA_4_BAR_POD }
    public enum DeviceStatus { NOT_READY, READY, CALIBRATING, FAULT_X_POD_NOT_DETECTED, FAULT_Y_POD_NOT_DETECTED, FAULT_NO_PODS_DETECTED, FAULT_IMU_RUNAWAY, FAULT_BAD_READ }
    public enum ReadData { ONLY_UPDATE_HEADING }
    public enum ErrorDetectionType { NONE, CRC, LOCAL_TEST }
    public enum Register { DEVICE_ID, DEVICE_VERSION, DEVICE_STATUS, DEVICE_CONTROL, LOOP_TIME, X_ENCODER_VALUE, Y_ENCODER_VALUE, X_POSITION, Y_POSITION, H_ORIENTATION,
        X_VELOCITY, Y_VELOCITY, H_VELOCITY, MM_PER_TICK, X_POD_OFFSET, Y_POD_OFFSET, YAW_SCALAR, BULK_READ, QUATERNION_W, QUATERNION_X, QUATERNION_Y, QUATERNION_Z, PITCH, ROLL, SET_BULK_READ }

    private String simName = "pinpoint";
    private double xOffsetMm = 0, yOffsetMm = 0;       // X pod offset = sideways from center (left +), Y pod offset = forward (+)
    private double ticksPerMm = 19.89436789;          // swingarm pod
    private int xDir = 1, yDir = 1;
    private double yawScalar = 1;
    // integrated state (mm, rad), field frame of the pinpoint: X forward, Y left at reset
    private double x, y, h, vx, vy, vh;
    private double lastPodX = Double.NaN, lastPodY, lastHeading;
    private int encX, encY;

    public GoBildaPinpointDriver(I2cDeviceSynchSimple deviceClient, boolean deviceClientIsOwned) {}
    public GoBildaPinpointDriver simName(String n) { simName = n; return this; }

    private Map<String, Object> raw() { return Sim.dev("pinpoint", simName); }

    /** Reads the two pods and the heading, and integrates the pose (call once per loop, like the real driver). */
    public void update() {
        Map<String, Object> m = raw();
        double heading = Json.num(m.get("h"), 0) * yawScalar;               // rad, robot yaw (CCW+)
        double wz = Json.num(m.get("wz"), 0);
        // pod travel measured at the robot center along robot forward (f) and robot left (l), in mm
        double cf = Json.num(m.get("f"), 0), cl = Json.num(m.get("l"), 0);
        // a pod away from the tracking center also sees the rotation. The physics may give the real pod offsets
        // ("xo","yo" mm); if the OpMode configured different ones, the pose drifts when turning, like on a real robot.
        double realX = Json.num(m.get("xo"), xOffsetMm), realY = Json.num(m.get("yo"), yOffsetMm);
        double podY = cf - realX * heading;   // "X pod" measures forward travel, mounted sideways by xOffset (left +)
        double podX = cl + realY * heading;   // "Y pod" measures strafe travel, mounted forward by yOffset (forward +)
        if (Double.isNaN(lastPodX)) { lastPodX = podX; lastPodY = podY; lastHeading = heading; }
        double dh = AngleUnit.normalizeRadians(heading - lastHeading);
        double dF = (podY - lastPodY) + xOffsetMm * dh;   // recover center travel using the configured offsets
        double dL = (podX - lastPodX) - yOffsetMm * dh;
        double mid = h + dh / 2;
        x += dF * Math.cos(mid) - dL * Math.sin(mid);
        y += dF * Math.sin(mid) + dL * Math.cos(mid);
        h = AngleUnit.normalizeRadians(h + dh);
        encX = (int) Math.round(podY * ticksPerMm) * xDir;
        encY = (int) Math.round(podX * ticksPerMm) * yDir;
        double vf = Json.num(m.get("vf"), 0), vl = Json.num(m.get("vl"), 0);
        vx = vf * Math.cos(h) - vl * Math.sin(h); vy = vf * Math.sin(h) + vl * Math.cos(h); vh = wz;
        lastPodX = podX; lastPodY = podY; lastHeading = heading;
    }
    public void update(ReadData data) { update(); }
    public void setBulkReadScope(Register... registers) {}
    public void setErrorDetectionType(ErrorDetectionType e) {}
    public void setOffsets(double xOffset, double yOffset) { setOffsets(xOffset, yOffset, DistanceUnit.MM); }
    public void setOffsets(double xOffset, double yOffset, DistanceUnit unit) { xOffsetMm = unit.toMm(xOffset); yOffsetMm = unit.toMm(yOffset); }
    public void recalibrateIMU() {}
    public void resetPosAndIMU() { x = y = h = 0; lastPodX = Double.NaN; }
    public void setEncoderDirections(EncoderDirection xEncoder, EncoderDirection yEncoder) {
        xDir = xEncoder == EncoderDirection.FORWARD ? 1 : -1; yDir = yEncoder == EncoderDirection.FORWARD ? 1 : -1;
    }
    public void setEncoderResolution(GoBildaOdometryPods pods) { ticksPerMm = pods == GoBildaOdometryPods.goBILDA_4_BAR_POD ? 13.26291192 : 19.89436789; }
    public void setEncoderResolution(double ticksPerUnit, DistanceUnit unit) { ticksPerMm = ticksPerUnit / unit.toMm(1); }
    public void setEncoderResolution(double ticksPerMm) { this.ticksPerMm = ticksPerMm; }
    public void setYawScalar(double s) { yawScalar = s; }
    public void setPosition(Pose2D pos) { x = pos.getX(DistanceUnit.MM); y = pos.getY(DistanceUnit.MM); h = pos.getHeading(AngleUnit.RADIANS); }
    public void setPosX(double posX, DistanceUnit u) { x = u.toMm(posX); }
    public void setPosY(double posY, DistanceUnit u) { y = u.toMm(posY); }
    public void setHeading(double heading, AngleUnit u) { h = u.toRadians(heading); }
    public int getDeviceID() { return 2; }
    public int getDeviceVersion() { return 3; }
    public float getYawScalar() { return (float) yawScalar; }
    public DeviceStatus getDeviceStatus() { return DeviceStatus.READY; }
    public int getLoopTime() { return 667; }
    public double getFrequency() { return 1500; }
    public int getEncoderX() { return encX; }
    public int getEncoderY() { return encY; }
    public double getPosX(DistanceUnit u) { return u.fromMm(x); }
    public double getPosY(DistanceUnit u) { return u.fromMm(y); }
    public double getHeading(AngleUnit u) { return u.fromRadians(h); }
    public double getHeading(UnnormalizedAngleUnit u) { return u.fromRadians(h); }
    public double getVelX(DistanceUnit u) { return u.fromMm(vx); }
    public double getVelY(DistanceUnit u) { return u.fromMm(vy); }
    public double getHeadingVelocity(UnnormalizedAngleUnit u) { return u.fromRadians(vh); }
    public float getXOffset(DistanceUnit u) { return (float) u.fromMm(xOffsetMm); }
    public float getYOffset(DistanceUnit u) { return (float) u.fromMm(yOffsetMm); }
    public Pose2D getPosition() { return new Pose2D(DistanceUnit.MM, x, y, AngleUnit.RADIANS, h); }
    @Deprecated public Pose2D getVelocity() { return new Pose2D(DistanceUnit.MM, vx, vy, AngleUnit.RADIANS, vh); }
    public Quaternion getQuaternion() { return new Quaternion((float) Math.cos(h / 2), 0, 0, (float) Math.sin(h / 2), 0); }
    public double getPitch(AngleUnit u) { return 0; }
    public double getRoll(AngleUnit u) { return 0; }
    public Manufacturer getManufacturer() { return Manufacturer.Other; }
    public String getDeviceName() { return "goBILDA Pinpoint Odometry Computer (sim)"; }
    public String getConnectionInfo() { return "sim"; }
    public int getVersion() { return 1; }
    public void resetDeviceConfigurationForOpMode() {}
    public void close() {}
}
