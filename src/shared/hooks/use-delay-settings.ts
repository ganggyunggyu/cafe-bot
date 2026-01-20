'use client';

import { useState, useEffect, useCallback } from 'react';

export interface DelayRange {
  min: number;
  max: number;
}

export interface DelaySettings {
  delays: {
    betweenPosts: DelayRange;
    betweenComments: DelayRange;
    afterPost: DelayRange;
  };
  retry: {
    attempts: number;
    backoffDelay: number;
  };
  limits: {
    enableDailyPostLimit: boolean;
    maxCommentsPerAccount: number;
  };
  timeout: number;
}

const STORAGE_KEY = 'cafe-bot-delay-settings';

export const DEFAULT_DELAY_SETTINGS: DelaySettings = {
  delays: {
    betweenPosts: { min: 30 * 1000, max: 60 * 1000 },
    betweenComments: { min: 3 * 1000, max: 10 * 1000 },
    afterPost: { min: 5 * 1000, max: 15 * 1000 },
  },
  retry: { attempts: 3, backoffDelay: 5000 },
  limits: { enableDailyPostLimit: false, maxCommentsPerAccount: 0 },
  timeout: 5 * 60 * 1000,
};

export const getDelaySettings = (): DelaySettings => {
  if (typeof window === 'undefined') return DEFAULT_DELAY_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_DELAY_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_DELAY_SETTINGS;
};

export const saveDelaySettings = (settings: DelaySettings): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const resetDelaySettings = (): DelaySettings => {
  if (typeof window === 'undefined') return DEFAULT_DELAY_SETTINGS;
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_DELAY_SETTINGS;
};

export const getRandomDelay = (range: DelayRange): number => {
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
};

export const useDelaySettings = () => {
  const [settings, setSettings] = useState<DelaySettings>(DEFAULT_DELAY_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSettings(getDelaySettings());
    setIsLoaded(true);
  }, []);

  const updateSettings = useCallback((newSettings: DelaySettings) => {
    setSettings(newSettings);
    saveDelaySettings(newSettings);
  }, []);

  const reset = useCallback(() => {
    const defaults = resetDelaySettings();
    setSettings(defaults);
    return defaults;
  }, []);

  return { settings, updateSettings, reset, isLoaded };
};
