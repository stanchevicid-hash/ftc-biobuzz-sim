package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.*;

public interface IMU extends HardwareDevice {
    boolean initialize(Parameters parameters);
    void resetYaw();
    YawPitchRollAngles getRobotYawPitchRollAngles();
    Orientation getRobotOrientation(AxesReference reference, AxesOrder order, AngleUnit angleUnit);
    Quaternion getRobotOrientationAsQuaternion();
    AngularVelocity getRobotAngularVelocity(AngleUnit angleUnit);

    class Parameters {
        public ImuOrientationOnRobot imuOrientationOnRobot;
        public Parameters(ImuOrientationOnRobot imuOrientationOnRobot) { this.imuOrientationOnRobot = imuOrientationOnRobot; }
        public Parameters copy() { return new Parameters(imuOrientationOnRobot); }
    }
}
