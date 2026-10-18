package org.opencv.core;

/** Camera frames are not produced by the simulator; custom VisionProcessors receive an empty Mat. */
public class Mat {
    public int width() { return 640; }
    public int height() { return 480; }
    public int rows() { return 480; }
    public int cols() { return 640; }
    public boolean empty() { return true; }
    public void release() {}
}
