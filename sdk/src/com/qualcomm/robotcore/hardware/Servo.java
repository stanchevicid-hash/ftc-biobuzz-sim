package com.qualcomm.robotcore.hardware;

public interface Servo extends HardwareDevice {
    double MIN_POSITION = 0.0;
    double MAX_POSITION = 1.0;
    enum Direction { FORWARD, REVERSE }
    ServoController getController();
    int getPortNumber();
    void setDirection(Direction direction);
    Direction getDirection();
    void setPosition(double position);
    double getPosition();
    void scaleRange(double min, double max);
}
