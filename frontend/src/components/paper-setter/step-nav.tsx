'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';

export interface WizardStep {
  id: string;
  title: string;
  lead: string;
  done: boolean;
  optional?: boolean;
}

export function StepNav({
  steps,
  current,
  unlocked,
  locked = false,
  onJump,
}: {
  steps: readonly WizardStep[];
  current: number;
  unlocked: boolean;
  locked?: boolean;
  onJump: (index: number) => void;
}): React.ReactElement {
  return (
    <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
      <Typography component="p" variant="caption" sx={VISUALLY_HIDDEN}>
        Step {current + 1} of {steps.length}
      </Typography>
      <Stepper nonLinear activeStep={current}>
        {steps.map((step, index) => {
          const reachable = !locked && (index === 0 || unlocked);
          const ticked = step.done && (locked || index < current);
          return (
            <Step key={step.id} completed={ticked}>
              <StepButton
                disabled={!reachable}
                onClick={() => onJump(index)}
                aria-current={index === current ? 'step' : undefined}
              >
                <StepLabel
                  optional={
                    step.optional ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                        Optional
                      </Typography>
                    ) : undefined
                  }
                >
                  {step.title}
                </StepLabel>
              </StepButton>
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
