package com.qualcomm.ftccommon;

import android.content.Context;
import ftcsim.Sim;
import java.io.File;

/** Sounds are logged instead of played. */
public class SoundPlayer {
    public static class PlaySoundParams {
        public float volume = 1.0f; public int loopControl = 0; public float rate = 1.0f; public boolean waitForNonLoopingSoundsToFinish = true;
        public PlaySoundParams() {}
        public PlaySoundParams(boolean wait) { waitForNonLoopingSoundsToFinish = wait; }
    }
    private static final SoundPlayer instance = new SoundPlayer();
    public static SoundPlayer getInstance() { return instance; }
    public boolean preload(Context context, int resourceId) { return true; }
    public boolean preload(Context context, File file) { return file != null; }
    public void startPlaying(Context context, int resId) { Sim.addLog("sound: resource " + resId); }
    public void startPlaying(Context context, File file) { Sim.addLog("sound: " + file); }
    public void startPlaying(Context context, int resId, PlaySoundParams params, Object runWhenStarted, Runnable runWhenFinished) {
        startPlaying(context, resId); if (runWhenFinished != null) runWhenFinished.run();
    }
    public void startPlaying(Context context, File file, PlaySoundParams params, Object runWhenStarted, Runnable runWhenFinished) {
        startPlaying(context, file); if (runWhenFinished != null) runWhenFinished.run();
    }
    public void stopPlayingAll() {}
    public void setMasterVolume(float v) {}
    public float getMasterVolume() { return 1f; }
}
