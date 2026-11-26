import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'

MotionGlobalConfig.skipAnimations = true // no real animations (and no Web Animations API needed) in unit tests
afterEach(() => cleanup())
