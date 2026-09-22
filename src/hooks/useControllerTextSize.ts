import { useCallback, useEffect, useState } from 'react';
import {
  CONTROLLER_TEXT_SIZE_STEP,
  DEFAULT_CONTROLLER_TEXT_SIZE,
  normalizeControllerTextSize,
  readControllerTextSize,
  saveControllerTextSize,
} from '../lib/controller-text-size';

export function useControllerTextSize() {
  const [percentage, setPercentage] = useState(() => readControllerTextSize());

  useEffect(() => { saveControllerTextSize(percentage); }, [percentage]);

  const decrease = useCallback(() => setPercentage((current) => normalizeControllerTextSize(current - CONTROLLER_TEXT_SIZE_STEP)), []);
  const increase = useCallback(() => setPercentage((current) => normalizeControllerTextSize(current + CONTROLLER_TEXT_SIZE_STEP)), []);
  const reset = useCallback(() => setPercentage(DEFAULT_CONTROLLER_TEXT_SIZE), []);

  return { percentage, decrease, increase, reset };
}
