import { useCallback, useEffect, useState } from 'react';
import {
  loadBuildPollInterval,
  saveBuildPollInterval,
} from '../storage';
import {
  DEFAULT_BUILD_POLL_INTERVAL,
  MIN_BUILD_POLL_INTERVAL,
  normalizePollInterval,
} from '../config/buildConfig';

/** 构建通用配置：轮询间隔（秒）。默认 10，最小 5，无上限。 */
export function useBuildConfig() {
  const [pollInterval, setPollIntervalState] = useState<number>(() =>
    loadBuildPollInterval()
  );

  useEffect(() => {
    setPollIntervalState(loadBuildPollInterval());
  }, []);

  const setPollInterval = useCallback((seconds: number) => {
    const next = normalizePollInterval(seconds);
    saveBuildPollInterval(next);
    setPollIntervalState(next);
  }, []);

  return {
    pollInterval,
    defaultPollInterval: DEFAULT_BUILD_POLL_INTERVAL,
    minPollInterval: MIN_BUILD_POLL_INTERVAL,
    setPollInterval,
  };
}
