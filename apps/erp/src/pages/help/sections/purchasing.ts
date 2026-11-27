/**
 * Usage guide: Purchasing (suppliers, purchase orders, receiving). Same shape as a GuideSection in
 * ../guideContent.ts, so it can be added to a chapter's sections as is. Button and tab names match the screens.
 */
import type { GuideSection } from '../guideContent';

export const purchasingSection: GuideSection = {
  id: 'inventory-purchasing',
  title: 'Order parts from suppliers',
  summary: 'Suppliers, purchase orders, emailing them, and receiving the parts into stock.',
  page: { to: '/purchasing', label: 'Open Purchasing' },
  steps: [
    {
      title: 'Add your suppliers',
      body: 'Open **Purchasing**, then the **Suppliers** tab, and press **Add supplier**. Enter the name, the **Order email** purchase orders go to, the phone number and **Our account number** if you have one.',
      callout: { kind: 'tip', text: 'Suppliers are never deleted. Use **Deactivate** for one you no longer use: its old orders stay as they were.' },
    },
    {
      title: 'Start a purchase order',
      body: 'On the **Purchase orders** tab press **New purchase order**, choose the supplier and press **Create draft**. Or, on a repair order, press **Order parts**, tick the part lines and choose a supplier: the draft is linked to that repair.',
      callout: { kind: 'note', text: 'A repair line can be on only one open purchase order. Lines the customer declined cannot be ordered.' },
    },
    {
      title: 'Add the lines',
      body: 'Under **Add a line**, pick a part from **Inventory part** (its part number and last cost fill in) or leave it as free text. Enter the **Qty** and **Unit cost**, then press **Add line**. Use **Edit** or the bin to change a line.',
      callout: { kind: 'note', text: 'Inventory parts are counted in whole units, so order whole quantities of them.' },
    },
    {
      title: 'Send it',
      body: 'Press **Email to supplier**: the PDF is made and emailed to the supplier, with replies coming back to your shop email. Ordered by phone or at the counter instead? Press **Mark as sent**. **Download PDF** saves a copy at any time.',
      callout: { kind: 'warning', text: 'Once sent, the lines and the supplier are fixed. You can still change **Needed by** and the notes.' },
    },
    {
      title: 'Receive the parts',
      body: 'When parts arrive, press **Receive**. Each line starts at what is still to come; change the numbers if only some arrived, correct the **Unit cost** if the price changed, and press **Receive into stock**.',
      callout: { kind: 'tip', text: 'Stock goes up straight away, and a changed cost becomes the part\'s latest unit cost. Receive the rest later: the order shows **Partly received** until everything is in.' },
    },
    {
      title: 'See what is on order',
      body: 'In **Inventory**, a part with parts coming shows **+N on order** under its stock; press it to see those orders. The **Open** filter on **Purchase orders** lists everything still to arrive.',
    },
    {
      title: 'Cancel an order',
      body: 'Press **Cancel order** if nothing more will come. Stock already received stays, and an email still waiting is not sent. A draft that was never sent can be removed with **Delete draft**.',
    },
    {
      title: 'PartsTech',
      body: 'Ordering straight from the PartsTech catalogue is coming. It needs your PartsTech partner keys and does nothing until then.',
    },
  ],
};

export default purchasingSection;
