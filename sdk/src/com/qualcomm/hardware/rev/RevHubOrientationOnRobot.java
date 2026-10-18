package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.ImuOrientationOnRobot;
import org.firstinspires.ftc.robotcore.external.navigation.*;

public class RevHubOrientationOnRobot implements ImuOrientationOnRobot {
    public enum LogoFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT }
    public enum UsbFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT }
    private final Quaternion rotation;

    public RevHubOrientationOnRobot(LogoFacingDirection logo, UsbFacingDirection usb) {
        if (logo.name().equals(usb.name()) || opposite(logo.name(), usb.name()))
            throw new IllegalArgumentException("The specified REV Hub orientation is impossible: logo " + logo + ", USB " + usb);
        rotation = mountQuaternion(logo.name(), usb.name());
    }
    private static double[] dir(String d) {
        switch (d) { case "UP": return new double[]{0, 0, 1}; case "DOWN": return new double[]{0, 0, -1}; case "FORWARD": return new double[]{0, 1, 0};
            case "BACKWARD": return new double[]{0, -1, 0}; case "LEFT": return new double[]{-1, 0, 0}; default: return new double[]{1, 0, 0}; }
    }
    /** hub frame in robot frame: hub +Z points where the logo faces, hub +Y where the USB ports face (logo UP + USB FORWARD = identity) */
    public static Quaternion mountQuaternion(String logo, String usb) {
        double[] z = dir(logo), y = dir(usb), x = {y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]};
        double[][] r = {{x[0], y[0], z[0]}, {x[1], y[1], z[1]}, {x[2], y[2], z[2]}};
        return Quaternion.fromMatrix(org.firstinspires.ftc.robotcore.external.matrices.GeneralMatrixF.of(r), 0);
    }
    private static boolean opposite(String a, String b) {
        return (a.equals("UP") && b.equals("DOWN")) || (a.equals("DOWN") && b.equals("UP")) || (a.equals("LEFT") && b.equals("RIGHT"))
                || (a.equals("RIGHT") && b.equals("LEFT")) || (a.equals("FORWARD") && b.equals("BACKWARD")) || (a.equals("BACKWARD") && b.equals("FORWARD"));
    }
    public RevHubOrientationOnRobot(Orientation rotation) { this.rotation = Quaternion.fromMatrix(rotation.getRotationMatrix(), 0); }
    public RevHubOrientationOnRobot(Quaternion rotation) { this.rotation = rotation; }
    public static Orientation zyxOrientation(double z, double y, double x) {
        return new Orientation(AxesReference.INTRINSIC, AxesOrder.ZYX, AngleUnit.DEGREES, (float) z, (float) y, (float) x, 0);
    }
    public static Orientation xyzOrientation(double x, double y, double z) {
        return new Orientation(AxesReference.INTRINSIC, AxesOrder.XYZ, AngleUnit.DEGREES, (float) x, (float) y, (float) z, 0);
    }
    public Quaternion imuCoordinateSystemOrientationFromPerspectiveOfRobot() { return rotation; }
    public Quaternion imuRotationOffset() { return rotation.inverse(); }
    public Quaternion angularVelocityTransform() { return rotation; }
}
