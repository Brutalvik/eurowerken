import type { GuideSection } from '../guideContent';

/** Settings > Accessibility: voice commands (off by default) and high contrast. Per device. */
export const ACCESSIBILITY_SECTION: GuideSection = {
  id: 'settings-accessibility',
  title: 'Voice commands and high contrast',
  summary: 'Turn voice commands on or off, and switch to high contrast. Both are saved on this device only.',
  page: { to: '/settings?tab=accessibility', label: 'Open Settings > Accessibility' },
  steps: [
    {
      title: 'Voice commands are off at first',
      body: 'In **Settings**, open **Accessibility** and turn on **Voice commands**. The microphone then appears in the command bar at the top and in the middle of the bottom bar on phones. The browser asks for microphone access the first time.',
      callout: { kind: 'note', text: 'Voice works in Chrome, Edge and Safari. With voice off, nothing listens: commands can still be typed with Cmd+K (Ctrl+K on Windows).' },
    },
    {
      title: 'What you can say or type',
      body: 'Go to a page ("Go to Appointments"), open a repair order ("Open RO-0001"), start a booking ("New appointment"), add a part ("Add part to inventory"), search service history ("Search BMW"), or switch high contrast or light and dark mode.',
    },
    {
      title: 'High contrast',
      body: 'Turn on **High contrast** here or with the accessibility button at the top right. Panels become solid with bright outlines, and every status shows an icon as well as its colour. It also turns on by itself when the device is set to increase contrast.',
    },
  ],
};
