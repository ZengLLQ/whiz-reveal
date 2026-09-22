import { MAX_CONTROLLER_TEXT_SIZE, MIN_CONTROLLER_TEXT_SIZE } from '../lib/controller-text-size';

type ControllerTextSizeProps = {
  percentage: number;
  decrease: () => void;
  increase: () => void;
  reset: () => void;
};

export function ControllerTextSize({ percentage, decrease, increase, reset }: ControllerTextSizeProps) {
  return (
    <div className="controller-text-control" role="group" aria-label="Controller text size">
      <span className="controller-text-label">UI text</span>
      <div className="controller-text-buttons">
        <button className="controller-text-step" type="button" disabled={percentage <= MIN_CONTROLLER_TEXT_SIZE}
          onClick={decrease} aria-label="Decrease controller text size" title="Smaller controller text (10% step)">
          <span aria-hidden="true">A<span className="controller-text-sign">−</span></span>
        </button>
        <button className="controller-text-reset" type="button" onClick={reset}
          aria-label={`Reset controller text size to 100 percent (currently ${percentage} percent)`}
          title="Reset controller text to 100%">
          <output aria-live="polite" aria-atomic="true">{percentage}%</output>
        </button>
        <button className="controller-text-step" type="button" disabled={percentage >= MAX_CONTROLLER_TEXT_SIZE}
          onClick={increase} aria-label="Increase controller text size" title="Larger controller text (10% step)">
          <span aria-hidden="true">A<span className="controller-text-sign">+</span></span>
        </button>
      </div>
    </div>
  );
}
