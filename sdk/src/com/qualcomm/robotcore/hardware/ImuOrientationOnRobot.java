package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

public interface ImuOrientationOnRobot {
    Quaternion imuCoordinateSystemOrientationFromPerspectiveOfRobot();
    Quaternion imuRotationOffset();
    Quaternion angularVelocityTransform();
}
