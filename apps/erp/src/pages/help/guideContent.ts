import { publicFile } from '@/lib/appUrl';
/**
 * The in-app usage guide (/help): chapters, sections and numbered steps.
 *
 * Every button, tab and status name here is written exactly as it appears in the ERP. When a screen
 * changes, change its steps here too. Screenshots live in apps/erp/public/guide/ (the list of names is
 * in public/guide/SHOTS.md); a missing file shows a placeholder with the alt text.
 *
 * Text may use **double asterisks** around the name of a button, tab or field; the page shows it in bold.
 */
import {
  BadgeDollarSign,
  BookOpen,
  Bell,
  Boxes,
  CalendarDays,
  Contact,
  HelpCircle,
  History,
  LayoutDashboard,
  Route,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { taxesSection } from './sections/taxes';
import { paymentsSection } from './sections/payments';
import { purchasingSection } from './sections/purchasing';
import { inspectionsSection } from './sections/inspections';
import { DATA_SECTION } from './sections/data';

export type CalloutKind = 'tip' | 'warning' | 'note';

export interface GuideShot {
  /** Served from public/guide/, for example /guide/appointments-week.png */
  src: string;
  alt: string;
  caption: string;
}

export interface GuideStep {
  title: string;
  /** One to three plain sentences. */
  body: string;
  callout?: { kind: CalloutKind; text: string };
  shot?: GuideShot;
}

export interface GuideSection {
  /** Anchor id, unique across the guide: <chapter id>-<name>, for example repair-orders-approvals. */
  id: string;
  title: string;
  summary?: string;
  /** A page of the ERP this section is about, linked under its title. */
  page?: { to: string; label: string };
  steps: GuideStep[];
}

export interface GuideChapter {
  id: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  /** Shown only to platform super admins. */
  adminOnly?: boolean;
  sections: GuideSection[];
}

const shot = (name: string, alt: string, caption: string): GuideShot => ({ src: publicFile(`guide/${name}.png`), alt, caption });

export const GUIDE: GuideChapter[] = [
  // 1. Getting started ---------------------------------------------------------------------------------
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'Sign in, create or join a workshop, accept an invite, and find your way around the screen.',
    icon: BookOpen,
    sections: [
      {
        id: 'getting-started-sign-in',
        title: 'Sign in',
        summary: 'Every member of staff has their own account. Sign in with your email and password, or with Google.',
        steps: [
          {
            title: 'Open the sign-in page',
            body: 'Go to the ERP address your workshop uses. The **Sign in** page asks for your **Work email** and **Password**.',
            shot: shot('sign-in', 'The Sign in page with Work email and Password fields and a Continue with Google button', 'The sign-in page.'),
          },
          {
            title: 'Enter your details and press Sign in',
            body: 'Type your work email and password, then press **Continue**. If your account uses Google, press **Continue with Google** instead.',
          },
          {
            title: 'Forgot your password?',
            body: 'Press **Forgot password?**, enter your work email and press **Send code**. Type the 6-digit code from the email (or open the link in it), then choose a new password of at least 8 characters.',
            callout: { kind: 'note', text: 'Codes and reset links work once and expire after a short time. Press Resend code if yours has expired.' },
          },
        ],
      },
      {
        id: 'getting-started-create-workshop',
        title: 'Create an account and a new workshop',
        summary: 'For the owner or manager setting up EuroWerken for the first time.',
        steps: [
          {
            title: 'Choose Create an account',
            body: 'On the sign-in page press **Create an account**.',
          },
          {
            title: 'Pick Create new',
            body: 'Under **Workshop** choose **Create new** and type the **Workshop name**, for example Bravo Motors. You become the Manager of the new workshop.',
            shot: shot('register-create-workshop', 'The Create an account form with Create new selected and a Workshop name field', 'Creating a new workshop while you register.'),
          },
          {
            title: 'Fill in your details',
            body: 'Enter your **Full name**, **Work email**, a **Password** of at least 8 characters and **Confirm password**, then press **Create account**.',
          },
          {
            title: 'Confirm your email',
            body: 'The **Check your inbox** step asks for the 6-digit code we emailed you. Type it in (or open the confirmation link in the email) and the ERP opens.',
            callout: { kind: 'tip', text: 'Your workshop gets a 6-digit workshop number. You find it on the Users & Roles page and in the sidebar under the workshop name.' },
          },
        ],
      },
      {
        id: 'getting-started-join-workshop',
        title: 'Join an existing workshop',
        summary: 'For staff whose workshop already uses EuroWerken and who do not have an invite link.',
        steps: [
          {
            title: 'Get the workshop number',
            body: 'Ask your manager for the 6-digit workshop number. It is shown on their Users & Roles page.',
          },
          {
            title: 'Register with Join existing',
            body: 'Press **Create an account**, choose **Join existing** and enter the **Workshop number**. Fill in your name, email and password and press **Create account**.',
            shot: shot('register-join-workshop', 'The Create an account form with Join existing selected and a Workshop number field', 'Joining a workshop with its number.'),
          },
          {
            title: 'Wait for approval',
            body: 'You see **Waiting for approval** until someone with full Users & Roles access assigns your role. Once they do, reload the page and your menu appears.',
            callout: { kind: 'tip', text: 'Typed the wrong number? Press Wrong workshop? Cancel request and choose again.' },
            shot: shot('waiting-for-approval', 'The Waiting for approval message with a Wrong workshop? Cancel request button', 'What you see until a manager approves you.'),
          },
          {
            title: 'Signed up with Google?',
            body: 'After Google sign-in you land on a **Welcome** page. Choose **Join existing** and press **Request to join**, or **Create new** and press **Create workshop**.',
          },
        ],
      },
      {
        id: 'getting-started-invites',
        title: 'Join with an invite link',
        summary: 'An invite link joins you straight away with the role your manager picked. No approval needed.',
        steps: [
          {
            title: 'Open the link you were sent',
            body: 'Your manager copies the link from Users & Roles and sends it to you. It looks like an address ending in /invite/ followed by a long code.',
          },
          {
            title: 'Create an account or sign in',
            body: 'Press **Create an account** if you are new, or **I already have an account**. Use the same email address the invite was made for.',
          },
          {
            title: 'Accept the invite',
            body: 'Press **Accept and join as** your role, for example Accept and join as Technician. The ERP opens with your menu ready.',
            shot: shot('invite-accept', 'The Join workshop page with an Accept and join as Technician button', 'Accepting an invite.'),
            callout: { kind: 'warning', text: 'An invite works once, only for its email, for 7 days. If it says expired or already used, ask for a new one.' },
          },
        ],
      },
      {
        id: 'getting-started-layout',
        title: 'The screen layout',
        summary: 'The sidebar on the left, the header on top, and the page in the middle.',
        steps: [
          {
            title: 'Sidebar',
            body: 'The sidebar lists only the pages your role can open. At the top it shows your workshop name and number; at the bottom, your name, your role, **Help** and the sign-out button.',
            shot: shot('layout-overview', 'The ERP with the sidebar, header with notification bell and theme button, and the Dashboard page', 'Sidebar, header and page.'),
          },
          {
            title: 'On tablets and phones',
            body: 'On a tablet the sidebar shrinks to a rail of icons; hover or long-press an icon to see its name. On a phone, press the menu button at the top left to slide the menu out, and tap outside it to close it.',
          },
          {
            title: 'Header',
            body: 'The header shows the name of the page you are on, the notification bell and the light or dark mode button.',
          },
          {
            title: 'Sign out',
            body: 'Press the sign-out icon next to your name at the bottom of the sidebar.',
          },
        ],
      },
      {
        id: 'getting-started-bell',
        title: 'The notification bell',
        steps: [
          {
            title: 'Unread count',
            body: 'The red number on the bell in the header is how many notifications you have not read yet. Press the bell to see them.',
            callout: { kind: 'tip', text: 'Everything about notifications is in the Notifications chapter.' },
          },
        ],
      },
      {
        id: 'getting-started-theme',
        title: 'Light and dark mode',
        steps: [
          {
            title: 'Switch the theme',
            body: 'Press the moon button in the header for dark mode, or the sun button to go back to light mode. Your choice is remembered on this device.',
          },
        ],
      },
    ],
  },

  // 2. Dashboard ----------------------------------------------------------------------------------------
  {
    id: 'dashboard',
    title: 'Dashboard',
    summary: 'The first page after sign-in: today\'s bookings and an overview of the workshop.',
    icon: LayoutDashboard,
    sections: [
      {
        id: 'dashboard-overview',
        title: 'What the Dashboard shows',
        page: { to: '/dashboard', label: 'Open the Dashboard' },
        steps: [
          {
            title: 'Today\'s appointments',
            body: 'The **Today\'s appointments** card lists the next five bookings of the day with their time, customer, car and status. Press **All appointments** to open the calendar.',
            shot: shot('dashboard', 'The Dashboard with KPI tiles, Today\'s appointments, Revenue trend and Stock alerts cards', 'The Dashboard.'),
            callout: { kind: 'note', text: 'The card shows only for roles that can view Repair Orders.' },
          },
          {
            title: 'Tiles and charts',
            body: 'The tiles show **Completed work (this month)** (approved items of repair orders completed this month, before tax), **Open repair orders**, **Stock alerts** (parts below their minimum) and **Awaiting approval** (orders waiting for the customer). Below them, **Completed work** charts the last six months and **Work mix** splits it by labour, parts, services and fees. **Recent repair orders** opens an order when you click its row, and **Stock alerts** lists the parts to reorder.',
            callout: { kind: 'note', text: 'Everything here is your workshop\'s real data. Charts stay empty until repair orders are completed. Each card shows only to roles that can view Repair Orders or Inventory.' },
          },
        ],
      },
    ],
  },

  // 3. Appointments ------------------------------------------------------------------------------------
  {
    id: 'appointments',
    title: 'Appointments',
    summary: 'The booking calendar: confirm online requests, book by phone, move, cancel and check cars in.',
    icon: CalendarDays,
    sections: [
      {
        id: 'appointments-calendar',
        title: 'The calendar: Day and Week',
        summary: 'Appointments opens on the Week view so upcoming bookings are visible straight away.',
        page: { to: '/appointments', label: 'Open Appointments' },
        steps: [
          {
            title: 'Choose Day or Week',
            body: 'Use the **Day** and **Week** buttons at the top. Week shows seven days side by side; Day shows one day as a timeline.',
            shot: shot('appointments-week', 'The Appointments page in Week view with bookings coloured by status', 'Week view.'),
          },
          {
            title: 'Move through the dates',
            body: 'The arrow buttons go to the previous or next day or week. **Today** jumps back to the current day. The date range is shown next to them.',
            shot: shot('appointments-day', 'The Appointments page in Day view with a timeline and a Now line', 'Day view, with the Now line.'),
          },
          {
            title: 'Read the calendar',
            body: 'Each booking is a coloured block: Requested, Confirmed, Checked in, Completed, Cancelled (struck through) or No-show. Closed weekdays, closed dates and holidays are labelled, for example Closed or Statutory holiday.',
            callout: { kind: 'note', text: 'Times are always in the workshop\'s time zone, shown under the calendar. On a phone the calendar becomes a list of days.' },
          },
        ],
      },
      {
        id: 'appointments-filters',
        title: 'Counts, filters and search',
        steps: [
          {
            title: 'The four tiles',
            body: '**Requested** counts upcoming bookings that still need confirming. **Confirmed** and **Cancelled** count the visible day or week; **Checked in** counts cars in the workshop.',
          },
          {
            title: 'Filter by status',
            body: 'Press **All**, **Requested**, **Confirmed**, **Checked in**, **Completed**, **Cancelled** or **No-show** to show only those bookings. Each button shows its count.',
          },
          {
            title: 'Search',
            body: 'Type in **Search name, reference, plate or phone** to find a booking in the visible days.',
          },
        ],
      },
      {
        id: 'appointments-needs-confirming',
        title: 'Needs confirming',
        summary: 'Online requests that wait for a member of staff, on any upcoming day.',
        steps: [
          {
            title: 'Find requests waiting for you',
            body: 'When customers book online and automatic confirmation is off, their bookings arrive as Requested. The **Needs confirming** card above the calendar lists them with day, time, customer, car and services.',
            shot: shot('appointments-needs-confirming', 'The Needs confirming card listing two requested bookings with Open buttons', 'Requests waiting to be confirmed.'),
          },
          {
            title: 'Open one',
            body: 'Press **Open** next to a request. The calendar jumps to that day and the booking opens.',
            callout: { kind: 'tip', text: 'More than six waiting? Use the Requested filter in Week view to see them all.' },
          },
        ],
      },
      {
        id: 'appointments-new',
        title: 'Book an appointment yourself',
        summary: 'For phone calls and walk-ins. Needs full Repair Orders access.',
        steps: [
          {
            title: 'Start a new booking',
            body: 'Press **New appointment**, or click an open time in the Day or Week calendar to start a booking at that time.',
          },
          {
            title: 'Contact and car',
            body: 'Enter the customer\'s **Name**, **Email** (the confirmation goes here) and **Phone (optional)**. Add the car\'s **Make**, **Model**, **Year** and **Plate**.',
            shot: shot('appointments-new', 'The New appointment dialog with Contact, Car, Services and When sections', 'The New appointment form.'),
          },
          {
            title: 'Services, time and status',
            body: 'Tick the services, then choose the **Date**, **Start time** and **Duration**. Only times within opening hours are offered. Pick a **Technician** if you know one, and a **Status**: **Confirmed**, or **Requested (confirm later)**.',
            callout: { kind: 'note', text: 'If the time is already full, the button changes to Book anyway. Every booking still has to start inside opening hours and on the slot grid.' },
          },
          {
            title: 'Save',
            body: 'Add **Notes** about what the customer described and press **Book appointment**. The booking appears in the calendar.',
          },
        ],
      },
      {
        id: 'appointments-confirm',
        title: 'Open, confirm or decline a booking',
        steps: [
          {
            title: 'Open the booking',
            body: 'Click a booking in the calendar. The dialog shows its status, whether it was **Booked online** or **Booked by staff**, contact details, car, services and estimate, and the customer\'s notes.',
            shot: shot('appointment-details', 'The Booking dialog with status buttons, contact, car and services', 'A booking opened from the calendar.'),
          },
          {
            title: 'Confirm',
            body: 'For a Requested booking, press **Confirm** under Status. It becomes Confirmed.',
          },
          {
            title: 'Or decline',
            body: 'Press **Decline**, type a reason (up to 300 characters, the customer may see it) and press **Decline booking**. Press **Keep booking** to go back.',
          },
        ],
      },
      {
        id: 'appointments-reschedule',
        title: 'Reschedule a booking',
        summary: 'Requested and Confirmed bookings can be moved.',
        steps: [
          {
            title: 'Change the time',
            body: 'In the booking\'s **Reschedule** section, choose a new **Date**, **Start time** or **Duration**.',
            shot: shot('appointment-reschedule', 'The Reschedule section of a booking with date, start time and duration fields and a Move booking button', 'Moving a booking.'),
          },
          {
            title: 'Move it',
            body: 'Press **Move booking**. If the new time is already busy the button reads **Move anyway**. **Undo changes** puts the old time back before you save.',
          },
        ],
      },
      {
        id: 'appointments-cancel',
        title: 'Cancel or mark a no-show',
        steps: [
          {
            title: 'Cancel',
            body: 'For a Confirmed booking press **Cancel**, enter a reason and press **Cancel booking**. The booking stays in the calendar, struck through.',
          },
          {
            title: 'No-show',
            body: 'If the customer did not come, press **No-show**.',
          },
        ],
      },
      {
        id: 'appointments-technician-notes',
        title: 'Technician and staff notes',
        steps: [
          {
            title: 'Assign a technician',
            body: 'Pick a name in **Assigned technician**. The list comes from Settings, Team.',
          },
          {
            title: 'Write staff notes',
            body: 'Type in **Notes for the team** and press **Save notes**. Staff notes are never shown to the customer.',
          },
        ],
      },
      {
        id: 'appointments-check-in',
        title: 'Check in: from booking to repair order',
        summary: 'When the car arrives, check it in. This creates its repair order.',
        steps: [
          {
            title: 'Press Check in',
            body: 'Open the Confirmed booking and press **Check in**. The booking becomes Checked in and a repair order is created with the booking\'s customer, car, services and notes.',
          },
          {
            title: 'Open the repair order',
            body: 'A green note says **Repair order RO-0001 created** (with your number). Press **Open repair order** to continue there.',
            shot: shot('appointment-checked-in', 'A checked-in booking with the note Repair order created and a link to open it', 'Check-in creates the repair order.'),
            callout: { kind: 'tip', text: 'For a walk-in, add an appointment first with New appointment, then check it in.' },
          },
          {
            title: 'Complete the booking',
            body: 'A Checked in booking has a **Complete** button. The repair order is completed separately on its own page.',
          },
        ],
      },
    ],
  },

  // 4. Repair orders -----------------------------------------------------------------------------------
  {
    id: 'repair-orders',
    title: 'Repair orders',
    summary: 'Every job from check-in to pickup: statuses, the estimate, customer approvals, photos, messages and the timeline.',
    icon: Wrench,
    sections: [
      {
        id: 'repair-orders-list',
        title: 'The repair orders list',
        page: { to: '/repair-orders', label: 'Open Repair Orders' },
        steps: [
          {
            title: 'Filter by status',
            body: 'The buttons at the top (**All**, **Checked in**, **Diagnosing**, **Awaiting approval**, **In progress**, **Quality check**, **Ready**, **Completed**, **Cancelled**) show how many orders are in each status.',
            shot: shot('repair-orders-list', 'The Repair Orders list with status filter buttons and a table of orders', 'The repair orders list.'),
          },
          {
            title: 'Search',
            body: 'Type in **Search number, name, plate or code** to find an order by its RO number, the customer\'s name, the plate or the tracking code.',
          },
          {
            title: 'Open an order',
            body: 'Click a row. Each row shows the number, customer, status, car, technician, **Items total** (with any amount still waiting for the customer) and when it was created.',
            callout: { kind: 'note', text: 'The list updates by itself when someone changes an order or a customer approves.' },
          },
        ],
      },
      {
        id: 'repair-orders-header',
        title: 'The order header and tracking code',
        steps: [
          {
            title: 'Read the header',
            body: 'At the top of the order: the RO number, its status, the car with plate and VIN, and when it was checked in. **View booking** opens the original appointment.',
            shot: shot('repair-order-header', 'The repair order header with number, status, car, customer and tracking code', 'The header of a repair order.'),
          },
          {
            title: 'Share tracking with the customer',
            body: 'Press **Copy customer tracking link** and send it to the customer. They follow the repair, approve work and send messages there. The copy button next to the **Tracking code** copies just the code.',
            callout: { kind: 'warning', text: 'The link needs the customer website (Settings, Website). If the website is not published, the link does not open for customers yet.' },
          },
        ],
      },
      {
        id: 'repair-orders-statuses',
        title: 'Statuses, in order',
        summary: 'The Progress card shows the steps; done steps get a tick, the current one is highlighted.',
        steps: [
          {
            title: '1. Checked in',
            body: 'The car has arrived. Press **Start diagnosis** to look at it, or **Start repair** if the work is already clear.',
            shot: shot('repair-order-progress', 'The Progress card with seven numbered steps and buttons Start diagnosis and Start repair', 'The Progress card.'),
          },
          {
            title: '2. Diagnosing',
            body: 'Add what you found as line items. Press **Send for approval** when the customer must agree, or **Start repair** if no approval is needed.',
          },
          {
            title: '3. Awaiting approval',
            body: 'The customer is deciding on the items you sent. When every item is answered, the order moves to In progress by itself. You can also press **Start repair**.',
          },
          {
            title: '4. In progress',
            body: 'The work is being done. Press **Quality check** when finished, or **Ready for pickup** to skip the check.',
          },
          {
            title: '5. Quality check',
            body: 'A final check. Press **Ready for pickup**, or **Back to repair** if something needs more work.',
          },
          {
            title: '6. Ready, then 7. Completed',
            body: 'The car can be collected. When the customer has picked it up, press **Complete**.',
          },
          {
            title: 'Cancelled',
            body: '**Cancel repair order** is available until the order is completed. After you confirm, the tracking page stops working and the order can no longer be changed.',
            callout: { kind: 'warning', text: 'Cancelling cannot be undone.' },
          },
        ],
      },
      {
        id: 'repair-orders-items',
        title: 'Line items and the estimate',
        summary: 'Services, parts, labour and fees make the estimate. Totals count approved items only.',
        steps: [
          {
            title: 'See the line items',
            body: 'The **Line items** card lists each item with its type, approval badge, quantity, unit price and total. Below it: **Approved subtotal**, **GST 5%** and **Total**, plus anything **Waiting for customer (not included)**.',
            shot: shot('repair-order-line-items', 'The Line items card with services, parts and labour, approval badges and totals', 'Line items and totals.'),
          },
          {
            title: 'Add an item',
            body: 'In **Add an item**, choose **Service**, **Part**, **Labour** or **Fee**. Pick a service or part from the list (its name and price fill in), or type a **Description**, then set the quantity or hours and the price and press the **Add** button.',
            shot: shot('repair-order-add-item', 'The Add an item form with Service, Part, Labour and Fee buttons', 'Adding an item.'),
            callout: { kind: 'tip', text: 'Labour fills in the workshop labour rate per hour. Set the rate in Settings, Booking.' },
          },
          {
            title: 'Change, reorder or remove',
            body: 'Change a quantity or unit price right in the row; it saves when you press Enter or leave the field. Use the up and down arrows to reorder, and the bin icon to remove an item.',
          },
        ],
      },
      {
        id: 'repair-orders-approvals',
        title: 'Customer approvals',
        summary: 'Ask the customer to approve work before you do it. Every decision is recorded and cannot be changed.',
        steps: [
          {
            title: 'Ask the customer to approve',
            body: 'Press **Ask customer to approve** on the Line items card (or **Send for approval** in Progress). Tick the items the customer should decide on.',
            shot: shot('repair-order-ask-approval', 'Line items with checkboxes and a Send 2 for approval button', 'Choosing items for approval.'),
          },
          {
            title: 'Send them',
            body: 'Press **Send for approval** (it shows how many, for example Send 2 for approval). The items show **Waiting for customer** and the order moves to Awaiting approval.',
          },
          {
            title: 'The customer decides online',
            body: 'On the tracking page the customer approves or declines each item. They must be signed in with the email the repair was booked with.',
            callout: { kind: 'note', text: 'Each decision is recorded once with the amount at that moment, the time, the customer\'s account and email, whether they were signed in, and the IP address and browser. Records can never be edited or deleted.' },
          },
          {
            title: 'Approval by phone',
            body: 'If the customer agrees on the phone, use **Record phone approval**: choose the items, approve or decline, and add a short note such as who you spoke to and when. It is recorded as a phone approval with your name.',
            shot: shot('repair-order-phone-approval', 'The Record phone approval form with items, approve or decline, and a note field', 'Recording a phone approval.'),
            callout: { kind: 'warning', text: 'Staff cannot simply switch an item to approved. Every decision goes through the customer online or Record phone approval, so there is always a record.' },
          },
          {
            title: 'Read the result',
            body: 'Approved items count in the total. Declined items are struck through and are not charged. You also get a notification when the customer answers.',
          },
        ],
      },
      {
        id: 'repair-orders-media',
        title: 'Photos and video',
        steps: [
          {
            title: 'Upload',
            body: 'On **Photos and video** press **Upload** and choose one or more photos or videos, up to 50 MB each. A bar shows the upload progress.',
            shot: shot('repair-order-media', 'The Photos and video card with photo tiles, captions and Visible to customer checkboxes', 'Photos of the repair.'),
          },
          {
            title: 'Caption and visibility',
            body: 'Type a caption under each item. Tick **Visible to customer** to show it on the tracking page; otherwise it is **Staff only**.',
          },
          {
            title: 'Delete',
            body: 'Press the bin icon on a tile and confirm to delete it.',
          },
        ],
      },
      {
        id: 'repair-orders-messages',
        title: 'Messages with the customer',
        steps: [
          {
            title: 'Send a message',
            body: 'Type in **Message to the customer** and press **Send** (or Ctrl or Cmd + Enter). It shows on the customer\'s tracking page.',
            shot: shot('repair-order-messages', 'The Messages card with staff messages on the right and customer messages on the left', 'The message thread.'),
          },
          {
            title: 'Read replies',
            body: 'Customer replies appear on the left, live, and also as a notification on the bell.',
          },
        ],
      },
      {
        id: 'repair-orders-timeline',
        title: 'The timeline',
        steps: [
          {
            title: 'What it records',
            body: 'The **Timeline** lists check-in, every status change, approvals and notes, newest last. Each entry says **Customer can see this** or **Staff only**.',
            shot: shot('repair-order-timeline', 'The Timeline card with entries and an Add note form', 'The timeline.'),
          },
          {
            title: 'Add a note',
            body: 'Type in **Add note** and press **Add note**. Tick **Visible to customer** to show it on the tracking page.',
          },
        ],
      },
      {
        id: 'repair-orders-job-details',
        title: 'Technician, promised time and staff notes',
        steps: [
          {
            title: 'Technician',
            body: 'In **Job details**, choose the **Technician** working on the car.',
          },
          {
            title: 'Promised for',
            body: 'Set the **Date** and **Time** you promised the car and press **Save promised time**. The customer sees it. **Clear** removes it.',
          },
          {
            title: 'Staff notes',
            body: 'Write **Staff notes** and press **Save notes**. Only the team sees them. The customer\'s notes from the booking are shown below.',
          },
        ],
      },
      {
        id: 'repair-orders-completing',
        title: 'Finishing a repair',
        steps: [
          {
            title: 'Check and hand over',
            body: 'When the work is done press **Quality check**, then **Ready for pickup**. The customer sees the car is ready on the tracking page.',
          },
          {
            title: 'Complete',
            body: 'When the car has been collected, press **Complete**. The order shows when it was completed and can no longer be edited.',
            callout: { kind: 'note', text: 'Invoicing and payment from a repair order are coming soon.' },
          },
        ],
      },
      inspectionsSection,
    ],
  },

  // 4b. Service history -------------------------------------------------------------------------------
  {
    id: 'service-history',
    title: 'Service history',
    summary: 'Every repair a vehicle has had at your workshop, found by VIN, plate, phone, name or email, and saved or printed as a PDF.',
    icon: History,
    sections: [
      {
        id: 'service-history-search',
        title: 'Find a vehicle',
        summary: 'Staff who can see Repair Orders can use Service history.',
        page: { to: '/service-history', label: 'Open Service history' },
        steps: [
          {
            title: 'Search',
            body: 'Type at least 2 characters in **Search by VIN, plate, phone, name or email**. The results update as you type; Enter searches straight away.',
          },
          {
            title: 'Read the results',
            body: 'Each vehicle shows its VIN and plate, the latest owner, how many visits it has had and the first and last visit. **N open** means repairs that are not completed or cancelled yet.',
            callout: { kind: 'tip', text: 'Part of a VIN, a plate or the last digits of a phone number is enough.' },
          },
        ],
      },
      {
        id: 'service-history-vehicle',
        title: 'A vehicle\'s history',
        steps: [
          {
            title: 'Open a vehicle',
            body: 'Click a vehicle to see every repair, newest first: the RO number (click it to open the repair order), status, dates, technician, the work done, approvals, photos, the timeline and the messages. **Back to results** returns to your search.',
          },
          {
            title: 'Done, Not done and Waiting',
            body: 'Approved items show **Done**, declined items **Not done** (struck through) and items still waiting for the customer **Waiting**. The total counts approved work only, plus GST.',
          },
          {
            title: 'Team only',
            body: 'Timeline notes, photos and videos the customer cannot see are marked **Team only**. Staff notes show in **Team notes**.',
          },
        ],
      },
      {
        id: 'service-history-pdf',
        title: 'Download or print',
        steps: [
          {
            title: 'Download PDF or Print',
            body: 'Press **Download PDF** to save the history, or **Print** to open the print dialog. Your logo from **Settings**, **Documents** heads the first page.',
          },
          {
            title: 'Very long histories',
            body: 'When the PDF is more than 50 pages, you are asked first. Press **Continue** to go ahead or **Cancel** to stop.',
          },
          {
            title: 'What the PDF leaves out',
            body: 'The PDF is the record of the work: each repair with its work lines, prices and taxes. It leaves out approvals, the timeline, photos, conversations and staff notes; those stay in the app.',
            callout: { kind: 'note', text: 'Photos and messages stay on the screen version of the history and on each repair order.' },
          },
        ],
      },
    ],
  },

  // 5. Customers ---------------------------------------------------------------------------------------
  {
    id: 'customers',
    title: 'Customers',
    summary: 'People who have an account on your customer website, with their cars.',
    icon: Contact,
    sections: [
      {
        id: 'customers-list',
        title: 'The customer list',
        page: { to: '/customers', label: 'Open Customers' },
        steps: [
          {
            title: 'Who is listed',
            body: 'Customers appear after they sign in on your website. Each row shows the name, phone, vehicles and **Customer since**.',
            shot: shot('customers-list', 'The Customers page with a search box and a table of customers', 'The customer list.'),
          },
          {
            title: 'Search',
            body: 'Type in **Search name, email, phone, plate or VIN**. The count next to the search box shows how many match.',
          },
        ],
      },
      {
        id: 'customers-details',
        title: 'A customer\'s details',
        steps: [
          {
            title: 'Open a customer',
            body: 'Click a row to see their email, phone, **Customer since**, **Account created** and their vehicles with plate and VIN.',
            shot: shot('customer-details', 'A customer dialog with contact details and a list of vehicles', 'A customer\'s details.'),
          },
          {
            title: 'Read-only',
            body: 'Customers manage their own name, phone and vehicles on your website, so you cannot change them here.',
            callout: { kind: 'note', text: 'Guests who book without an account are not listed here; their details are on the booking and repair order.' },
          },
        ],
      },
    ],
  },

  // 6. Parts Inventory ---------------------------------------------------------------------------------
  {
    id: 'inventory',
    title: 'Parts Inventory',
    summary: 'Your parts, their stock and prices, and what your website\'s parts shop shows.',
    icon: Boxes,
    sections: [
      {
        id: 'inventory-list',
        title: 'The parts list',
        page: { to: '/inventory', label: 'Open Parts Inventory' },
        steps: [
          {
            title: 'Find a part',
            body: 'Type in **Search parts, SKUs, brands**, or press a category button to show one category.',
            shot: shot('inventory-list', 'The Parts Inventory list with search, category tabs, stock and status badges', 'The parts list.'),
          },
          {
            title: 'Read the stock',
            body: '**Stock** shows the number in stock and the minimum. The status badge says **In stock**, **Low stock** (below the minimum) or **Out of stock**, and **Published** or **Hidden** for the parts shop.',
            callout: { kind: 'note', text: 'Unit cost is shown only to roles that can view Inventory and is never shown on the website.' },
          },
        ],
      },
      {
        id: 'inventory-add',
        title: 'Add a part',
        summary: 'Needs full Parts Inventory access.',
        steps: [
          {
            title: 'Open the form',
            body: 'Press **Add part**.',
          },
          {
            title: 'Fill in the details',
            body: 'Enter the **Name**, **Brand**, **Category**, **Part number** and **SKU**, a **Summary** and **Description**, and add **Photos** (the first is the main one in the shop).',
            shot: shot('inventory-part-form', 'The Add part dialog with name, photos, price and stock fields', 'The part form.'),
          },
          {
            title: 'Price and stock',
            body: 'Set **Price (CAD)**, an optional **Compare-at (CAD)** old price, **In stock** and **Minimum stock**. Below the minimum the part shows as low stock.',
          },
          {
            title: 'Shop details and save',
            body: 'Add **Fitment**, **Quality**, **Warranty**, **Features** and **Specifications** if you like, and the staff-only **Unit cost (CAD)**. Tick **Published** to show it in your website\'s parts shop, then press **Save part**.',
          },
        ],
      },
      {
        id: 'inventory-edit-delete',
        title: 'Edit or delete a part',
        steps: [
          {
            title: 'Edit',
            body: 'Press **Edit** on the part\'s row, change what you need and press **Save part**.',
          },
          {
            title: 'Delete',
            body: 'Press **Delete**, then **Delete part** to confirm. It is removed from your inventory and the parts shop with its photos.',
            callout: { kind: 'warning', text: 'Deleting cannot be undone. To take a part off the shop for now, untick Published instead.' },
          },
        ],
      },
      purchasingSection,
    ],
  },

  // 7. Users & Roles -----------------------------------------------------------------------------------
  {
    id: 'users-roles',
    title: 'Users & Roles',
    summary: 'Bring your team in, decide who can do what, and approve join requests.',
    icon: ShieldCheck,
    sections: [
      {
        id: 'users-roles-workshop-number',
        title: 'Your workshop number',
        page: { to: '/users', label: 'Open Users & Roles' },
        steps: [
          {
            title: 'Find it',
            body: 'The first card shows your workshop name and its 6-digit **Workshop number**. Staff can request to join with it when they register.',
          },
        ],
      },
      {
        id: 'users-roles-invite',
        title: 'Invite someone with a role',
        summary: 'The quickest way in: they join with the role you pick, no approval needed.',
        steps: [
          {
            title: 'Create the invite',
            body: 'In **Invite someone**, type their email, choose the role (**Manager**, **Service Advisor**, **Technician**, **Parts Staff** or **Accountant**) and press **Create invite link**.',
            shot: shot('users-invite', 'The Invite someone card with an email, a role picker and a created invite link', 'Creating an invite link.'),
            callout: { kind: 'note', text: 'Only a Manager can invite another Manager.' },
          },
          {
            title: 'Send the link',
            body: 'Press **Copy** and send the link to them yourself, for example by email or text. It is not emailed automatically.',
          },
          {
            title: 'Manage open invites',
            body: 'Open invites are listed with their role and expiry date. **Copy link** copies it again; **Revoke** cancels it. Expired invites show **Expired** and a **Remove** button.',
            callout: { kind: 'warning', text: 'A link works once, only for that email, for 7 days.' },
          },
        ],
      },
      {
        id: 'users-roles-join-requests',
        title: 'Approve join requests',
        steps: [
          {
            title: 'Find waiting people',
            body: 'People who registered with your workshop number are listed first in **Team** with **Awaiting approval**. The card subtitle says how many are waiting.',
            shot: shot('users-team', 'The Team table with a member awaiting approval and role pickers', 'The Team list.'),
          },
          {
            title: 'Assign a role',
            body: 'Choose a role in their **Role** picker. They get access the next time they load the app.',
            callout: { kind: 'tip', text: 'Do not recognise someone? Deactivate them instead of assigning a role.' },
          },
        ],
      },
      {
        id: 'users-roles-team',
        title: 'Change roles and deactivate accounts',
        steps: [
          {
            title: 'Change a role',
            body: 'Pick a different role in the person\'s **Role** picker. You cannot change your own role or status.',
          },
          {
            title: 'Deactivate or reactivate',
            body: 'Press **Deactivate** to lock someone out; their status becomes **Deactivated**. Press **Reactivate** to let them back in.',
          },
        ],
      },
      {
        id: 'users-roles-roles',
        title: 'The roles',
        summary: 'Each role has a default access level per page. Managers can change it in the permission matrix.',
        steps: [
          {
            title: 'Manager',
            body: 'Full access to everything, always. Only a Manager edits the permission matrix and the customer website.',
          },
          {
            title: 'Service Advisor',
            body: 'By default: full Repair Orders (and so Appointments), Customers and Invoices; view Dashboard and Sales.',
          },
          {
            title: 'Technician',
            body: 'By default: full Repair Orders (and so Appointments); view Dashboard, Parts Inventory and Customers.',
          },
          {
            title: 'Parts Staff',
            body: 'By default: full Parts Inventory; view Dashboard, Repair Orders, Customers and Sales.',
          },
          {
            title: 'Accountant',
            body: 'By default: full Sales, Invoices and Reports & Analytics; view Dashboard, Parts Inventory, Repair Orders and Customers.',
          },
        ],
      },
      {
        id: 'users-roles-permissions',
        title: 'The permission matrix',
        steps: [
          {
            title: 'Read the matrix',
            body: 'The **Role permissions** card has a row per page and a column per role. **None** hides the page, **View** lets the role look, **Full** lets it change things.',
            shot: shot('users-permissions', 'The Role permissions matrix with None, View and Full pickers and Reset to default links', 'The permission matrix.'),
          },
          {
            title: 'Change an access level',
            body: 'A Manager picks None, View or Full in any cell. The Manager column is fixed at Full. Changes apply the next time each person loads the app.',
            callout: { kind: 'note', text: 'Appointments follows the Repair Orders row: View to see bookings, Full to book and change them. Help is open to everyone.' },
          },
        ],
      },
      {
        id: 'users-roles-reset',
        title: 'Reset to default',
        steps: [
          {
            title: 'Reset one role',
            body: 'Press **Reset to default** under a role\'s name and confirm with **Reset**. That role goes back to its default access for every page.',
          },
          {
            title: 'Reset every role',
            body: 'Press **Reset all roles to defaults** and confirm. Every role except Manager goes back to the defaults.',
            callout: { kind: 'warning', text: 'Your custom changes for those roles are lost.' },
          },
        ],
      },
    ],
  },

  // 8. Settings ----------------------------------------------------------------------------------------
  {
    id: 'settings',
    title: 'Settings',
    summary: 'Opening hours, holidays, booking rules, labour rate, your customer website, services and team.',
    icon: Settings,
    sections: [
      {
        id: 'settings-tabs',
        title: 'The Settings tabs',
        page: { to: '/settings', label: 'Open Settings' },
        steps: [
          {
            title: 'The tabs',
            body: 'Settings has the tabs **Website**, **Services**, **Team**, **Booking**, **Taxes**, **Payments**, **Inspections**, **Notifications**, **Documents** and **Data**. The open tab is part of the page address, so you can bookmark it.',
          },
        ],
      },
      {
        id: 'settings-documents',
        title: 'Documents: your logo on PDFs',
        page: { to: '/settings?tab=documents', label: 'Open Documents' },
        steps: [
          {
            title: 'Upload your logo',
            body: 'In **Settings**, **Documents**, press **Upload logo** and pick a PNG, JPEG, WebP or SVG. It is saved as a PNG and shows at the top of invoices and the service history PDF (and quotes, when they are added).',
          },
          {
            title: 'Check it',
            body: 'Press **Preview an invoice** to open a sample invoice with your logo. **Replace logo** swaps it; **Remove** goes back to your website logo, if you have one.',
          },
          {
            title: 'Turn it off',
            body: 'Untick **Show the logo on invoices and other PDFs** to show only your shop name.',
            callout: { kind: 'note', text: 'Only staff with full access to Settings can change the logo.' },
          },
        ],
      },
      {
        id: 'settings-hours',
        title: 'Business hours',
        summary: 'Customers and staff can book only within these hours.',
        steps: [
          {
            title: 'Open the Booking tab',
            body: 'Go to **Settings**, **Booking**. The **Opening hours** card lists every weekday.',
            shot: shot('settings-opening-hours', 'The Opening hours card with a row per weekday, Closed checkboxes and time pickers', 'Opening hours.'),
          },
          {
            title: 'Set the times',
            body: 'For each day choose the opening and closing time. Times go in 30-minute steps, on the hour or half hour. Tick **Closed** for days with no bookings.',
          },
          {
            title: 'Save',
            body: 'Press **Save opening hours**. Your website\'s opening hours are built from these, so you do not enter them twice.',
            callout: { kind: 'note', text: 'Bookings start on the slot grid counted from opening time, and must leave room for at least one slot before closing.' },
          },
        ],
      },
      {
        id: 'settings-holidays',
        title: 'Holidays and closed dates',
        steps: [
          {
            title: 'Add a closed date',
            body: 'In **Closed dates**, pick the **Date**, type a **Reason (optional)** such as Statutory holiday, and press **Add closed date**. No bookings can be made that day.',
            shot: shot('settings-closed-dates', 'The Closed dates card with a list of dates and the Add Canadian holidays dialog', 'Closed dates and holidays.'),
          },
          {
            title: 'Add Canadian holidays',
            body: 'Press **Add Canadian holidays**, choose the **Year** and **Region**, tick the holidays you close for (statutory ones are ticked for you) and press **Add selected**.',
            callout: { kind: 'tip', text: 'Rules differ by province and employer, so check your province\'s official list of statutory holidays.' },
          },
          {
            title: 'Remove one',
            body: 'Press the remove button next to a closed date to open that day for bookings again.',
          },
        ],
      },
      {
        id: 'settings-booking',
        title: 'Online booking settings',
        steps: [
          {
            title: 'Time zone and slots',
            body: 'In **Online booking**, choose the **Time zone** (all booking times use it) and the **Slot length**: how far apart start times are offered (15, 20, 30, 45 or 60 minutes).',
            shot: shot('settings-booking', 'The Online booking card with time zone, slot length, bays, notice, window, labour rate and auto-confirm', 'Online booking settings.'),
          },
          {
            title: 'Capacity and timing',
            body: '**Bays** is how many cars can be booked at the same time (1 to 50). **Minimum notice (hours)** is how soon a customer can book, and **Booking window (days ahead)** how far ahead.',
          },
          {
            title: 'Holiday region',
            body: 'The **Holiday region** decides which public holidays the calendar labels and the holiday picker offers.',
          },
          {
            title: 'Automatic confirmation',
            body: 'With **Confirm online bookings automatically** on, a booking is confirmed the moment the customer books (if the time is free). Off, it arrives as Requested and you confirm or decline it in Appointments.',
          },
          {
            title: 'Save',
            body: 'Press **Save booking settings**.',
          },
        ],
      },
      {
        id: 'settings-labour-rate',
        title: 'Labour rate',
        steps: [
          {
            title: 'Set your hourly rate',
            body: 'In **Online booking**, enter the **Standard hourly labour rate (CAD)**, for example 145.00, and press **Save booking settings**.',
          },
          {
            title: 'Where it is used',
            body: 'Each new repair order takes this rate. Labour line items fill it in per hour, and the Line items card shows it.',
          },
        ],
      },
      {
        id: 'settings-website-deploy',
        title: 'Website: deploy your website',
        summary: 'A guided setup for your customer website, with a live preview of the real site. Only staff with full access to Settings can use it.',
        page: { to: '/settings', label: 'Open Settings, Website' },
        steps: [
          {
            title: 'Start the setup',
            body: 'Go to **Settings**, **Website**. Until your site is set up you see "Your customer website isn\'t live yet". Press **Deploy your website**.',
            callout: { kind: 'note', text: 'Staff without full access to Settings see "Ask a manager to set it up".' },
          },
          {
            title: 'Go through the steps',
            body: 'The steps are **Welcome**, **Web address and name**, **Colours and style**, **Layout**, **Home page**, **Content** and **Review and deploy**. Press **Next** and **Back**, or pick a step in the list to go back to it. Booking, tracking, My Garage, sign-in and invoices are always included.',
          },
          {
            title: 'Choose a style',
            body: 'In **Colours and style**, pick a ready-made style, or **Custom** to choose your own brand colour, font, corners and default mode. In **Home page**, turn sections on or off and use the arrows to put them in order; the hero always comes first.',
          },
          {
            title: 'Watch the preview',
            body: 'The preview shows your real website with your choices. Switch between **Desktop** and **Phone**. On a small screen, press **Preview** to show it. If it says the preview could not load, the customer site is not running at its address.',
          },
          {
            title: 'Your progress is saved',
            body: 'Each time you press **Next**, your choices are saved without making anything public, so you can leave and carry on later.',
          },
          {
            title: 'Deploy',
            body: 'On **Review and deploy**, check everything (press **Edit** to change a line) and press **Deploy website**. "Your website is live" shows your address with **Copy** and **Open**.',
          },
          {
            title: 'Change the design later',
            body: 'Once live, **Settings**, **Website** shows a **Design** panel. Press **Change design** to open the setup at the colours step, change anything, and press **Save changes** on the last step. **Preview** opens your live site in a new tab.',
          },
        ],
      },
      {
        id: 'settings-website-branding',
        title: 'Website: name, address and branding',
        summary: 'Your public site where customers book, track repairs and shop parts. Only a Manager can change it.',
        steps: [
          {
            title: 'Open the Website tab',
            body: 'Go to **Settings**, **Website**. The **Customer website** card shows whether it is **Published** or **Not published**.',
            shot: shot('settings-website', 'The Customer website card with name, web address, brand colour and headline fields', 'Customer website settings.'),
          },
          {
            title: 'Name and address',
            body: 'Set the **Name on the website** and the **Web address** (3 to 48 lowercase letters, digits or hyphens). The address is shown under the field.',
          },
          {
            title: 'Brand colour and home page',
            body: 'Pick a **Brand colour**. Write the home page **Headline**, the **Word to colour** (it must appear in the headline), a **Tagline** and the **Intro text**. Add a **Logo URL** if you have one.',
          },
        ],
      },
      {
        id: 'settings-website-navigation',
        title: 'Website: navigation style',
        steps: [
          {
            title: 'Choose a style',
            body: 'Under **Navigation**, choose **Classic header menu** (all sections in the header, a menu button on phones) or **Liquid glass tab bar** (a floating glass bar at the bottom with an animated bead on the current page).',
            shot: shot('settings-website-navigation', 'The Navigation choice between Liquid glass tab bar and Classic header menu', 'Navigation style.'),
          },
        ],
      },
      {
        id: 'settings-website-contact',
        title: 'Website: contact, social and your own website',
        steps: [
          {
            title: 'Contact and social',
            body: 'Under **Contact and social**, fill in **Phone**, **Contact email**, **Address** and your **Instagram**, **Facebook** and **YouTube** links.',
          },
          {
            title: 'Your own website',
            body: 'Already have a website? Enter it in **Your own website** and customers see a "Visit our website" link.',
          },
        ],
      },
      {
        id: 'settings-website-publish',
        title: 'Website: publish',
        steps: [
          {
            title: 'Publish and save',
            body: 'Tick **Published** and press **Save website**. Customers can now book, shop and track repairs there.',
          },
          {
            title: 'Look at it',
            body: 'Press **Open website** to see it in a new tab. Before publishing, the button reads **Preview address**.',
            callout: { kind: 'warning', text: 'While the website is not published, customer tracking links do not open.' },
          },
        ],
      },
      {
        id: 'settings-services',
        title: 'Services',
        summary: 'What your website lists under Services, and what staff pick on bookings and repair orders.',
        steps: [
          {
            title: 'Add a service',
            body: 'On the **Services** tab press **Add service**. Enter the **Name**, **Category**, **Description**, **Duration** (for example 45 to 60 mins) and **Price from (CAD)**.',
            shot: shot('settings-services', 'The Services list with categories, prices, durations and Active badges', 'The services list.'),
          },
          {
            title: 'Badge, order, icon and photo',
            body: 'Pick a **Badge** (**None**, **Popular** or **Recommended**), a **Sort order** (lower comes first), an **Icon** and an optional **Photo**, then press **Save service**.',
          },
          {
            title: 'Hide without deleting',
            body: 'Untick **Active** to hide a service from your website while keeping it. Hidden services are not offered when booking.',
          },
        ],
      },
      {
        id: 'settings-team',
        title: 'Team (technician profiles)',
        summary: 'Profiles on your website\'s Experts page. These are also the technicians you assign to jobs.',
        steps: [
          {
            title: 'Add a member',
            body: 'On the **Team** tab press **Add member**. Enter the **Name**, **Role title** (for example Master Technician), **Bio**, **Specialties**, **Makes**, **Languages**, **Certifications** and **Years of experience**.',
            shot: shot('settings-team', 'The Team list of technician profiles with Public and Hidden badges', 'Technician profiles.'),
          },
          {
            title: 'Photo and visibility',
            body: 'Add a **Photo** (a portrait works best). Tick **Public** to show the profile on the Experts page, then press **Save profile**.',
            callout: { kind: 'note', text: 'Team profiles are separate from staff accounts in Users & Roles. Add a profile for every technician you want to assign.' },
          },
        ],
      },
      taxesSection,
      DATA_SECTION,
    ],
  },

  // 9. Notifications -----------------------------------------------------------------------------------
  {
    id: 'notifications',
    title: 'Notifications',
    summary: 'New bookings, cancellations, customer messages and approvals, as they happen.',
    icon: Bell,
    sections: [
      {
        id: 'notifications-bell',
        title: 'The bell',
        steps: [
          {
            title: 'Open the list',
            body: 'Press the bell in the header. The latest notifications are listed; unread ones are bold with a dot.',
            shot: shot('notifications-bell', 'The notification panel open under the bell with unread items and Mark all as read', 'The notification panel.'),
          },
          {
            title: 'Go to the booking or repair',
            body: 'Press a notification. It is marked read and opens the booking or repair order it is about.',
          },
          {
            title: 'Mark all as read',
            body: 'Press **Mark all as read** at the top of the panel.',
          },
        ],
      },
      {
        id: 'notifications-what',
        title: 'What creates a notification',
        steps: [
          {
            title: 'Bookings',
            body: 'A new booking, and a booking cancelled by the customer.',
          },
          {
            title: 'Repairs',
            body: 'A message from a customer, and a customer approving or declining work. A message notification opens the repair order at its Messages card.',
          },
        ],
      },
      {
        id: 'notifications-mute',
        title: 'Muting customer messages',
        steps: [
          {
            title: 'Mute one customer',
            body: 'On a repair order, the **Messages** card has a **Notify me** button. Press it to mute that customer: it changes to **Muted**. You can do the same from the customer\'s details in **Customers**. Press it again to turn notifications back on.',
          },
          {
            title: 'Mute all customers',
            body: 'In **Settings**, **Notifications**, untick **Notify the team when a customer sends a message**. The same page lists every muted customer, with **Unmute**.',
          },
          {
            title: 'What muting does',
            body: 'Muting is for the whole shop, and it only stops the notification. The messages still arrive on the repair order. Approvals and bookings always notify.',
            callout: { kind: 'tip', text: 'Muting one customer needs full access to Repair Orders or Customers. Muting everyone needs full access to Settings.' },
          },
        ],
      },
      {
        id: 'notifications-customer-emails',
        title: 'Emails to customers',
        page: { to: '/settings?tab=notifications', label: 'Open Settings' },
        steps: [
          {
            title: 'Progress emails',
            body: 'With **Email customers at every progress step** on, the customer gets an email each time their repair moves to a new step. Customers with an account who turned emails off get none.',
          },
          {
            title: 'Approval requests',
            body: 'Every time you ask the customer to approve work (**Ask customer to approve** on a repair order, or sending an inspection with its findings), they get an email listing each item waiting for their decision, the prices and a **Review and approve** button. This includes a second or third request while the repair is already waiting. Approval emails are sent even with progress emails off, because the work cannot go ahead without an answer.',
          },
          {
            title: 'Invoice email',
            body: 'With **Email the invoice as a PDF when a repair is ready for pickup** on, the invoice is emailed when the repair is marked Ready for pickup.',
          },
          {
            title: 'Invoice privacy',
            body: 'With **Hide customer phone and email on invoices** on (the default), invoices show the phone as 403 471 xxxx and the email as vixxx0@gmail.com. This is the starting choice when printing and in the emailed copy; staff can still choose each time they print.',
          },
          {
            title: 'See what was sent',
            body: 'The **Customer emails** card on a repair order lists every email for that repair, newest first, with its state and any error.',
            callout: { kind: 'note', text: 'Changing these needs full access to Settings. Emails go out from the shop\'s email account set up in Supabase. Text messages (SMS) are coming later.' },
          },
        ],
      },
      {
        id: 'notifications-popups',
        title: 'Pop-ups and the Appointments badge',
        steps: [
          {
            title: 'Pop-ups',
            body: 'While the ERP is open, each new notification also shows as a small pop-up at the bottom right for 8 seconds. Press it to open, or dismiss it.',
          },
          {
            title: 'New bookings badge',
            body: 'The red number next to **Appointments** in the sidebar counts bookings nobody has opened yet. It goes down as you open them.',
          },
        ],
      },
    ],
  },

  // 10. Sales, invoices and reports --------------------------------------------------------------------
  {
    id: 'sales-invoices',
    title: 'Sales, invoices and reports',
    summary: 'Automatic invoices from repair orders, real reports; sales come with payments.',
    icon: BadgeDollarSign,
    sections: [
      {
        id: 'sales-invoices-automatic',
        title: 'Automatic invoices',
        page: { to: '/invoices', label: 'Open Invoices' },
        steps: [
          {
            title: 'Created at Ready for pickup',
            body: 'When a repair order is marked **Ready for pickup**, its invoice is created by itself from the approved items, with your province\'s sales taxes, and numbered INV-0001, INV-0002 and so on. Marking the same repair ready again updates that invoice and sends it again.',
          },
          {
            title: 'Emailed as a PDF',
            body: 'The ERP makes the invoice PDF as soon as the invoice shows on the repair order or in **Invoices**, stores it, and then the invoice is emailed with the PDF attached, when invoice emails are on in **Settings**, **Notifications**. It is created and kept in **Invoices** either way. Until the PDF is stored, the email shows **Preparing the PDF**.',
            callout: { kind: 'note', text: 'The PDF is made by someone with full access to Invoices or Repair Orders who has the invoice open. If it could not be stored, the card says so; press **Try again**.' },
          },
          {
            title: 'What the invoice shows',
            body: 'The shop\'s name, logo, address and contact details at the top; the customer, the vehicle and the job (repair number, check-in and completion dates, technician); the work grouped under **Services**, **Labour**, **Parts** and **Fees**; the subtotal, GST and total; the technician\'s notes the customer may see; and any work the customer declined, listed as recommendations without a charge. A void invoice is marked **VOID**.',
          },
          {
            title: 'The Invoices tab',
            body: 'Press **Invoices** in the sidebar. The cards show **Invoiced this month**, **Invoices this month** and **Void**. The list shows each invoice with its customer, vehicle, total, status (**Issued** or **Void**), the state of its email and its repair order. Search by number, customer or plate.',
          },
          {
            title: 'Download or print',
            body: 'Press **Download PDF** to save the invoice, or **Print** to open the print dialog. The PDF is made fresh each time, so it always matches the repair order; the button shows **Preparing...** meanwhile. Void invoices can be downloaded and printed too.',
          },
          {
            title: 'Customer phone and email',
            body: 'Tick **Show customer phone and email** to print them in full; untick it to show them partly hidden (403 471 xxxx, vixxx0@gmail.com). It starts from the shop\'s setting **Hide customer phone and email on invoices** in **Settings**, **Notifications**, which also decides the emailed copy. In **Invoices** one checkbox above the list applies to every invoice.',
            callout: { kind: 'tip', text: 'Anyone who can see invoices can download and print them.' },
          },
          {
            title: 'Send again',
            body: 'Press **Send again** to email the invoice to the customer again: a fresh PDF is made and stored at once, then the email is queued. The email column shows **Preparing the PDF**, **Waiting to send**, **Sent**, **Failed** with the error, or **Not sent** with the reason.',
            callout: { kind: 'tip', text: 'Send again needs full access to Invoices or Repair Orders.' },
          },
          {
            title: 'On the repair order',
            body: 'The **Invoice** card on a repair order shows its invoice, totals, **Download PDF**, **Print**, the phone and email checkbox, and **Send again**. Before Ready for pickup it says the invoice will be created then.',
          },
          {
            title: 'Cancelled repairs',
            body: 'Cancelling a repair order makes its invoice **Void**. Void invoices stay in the list but do not count in this month\'s totals and cannot be sent again.',
          },
        ],
      },
      {
        id: 'sales-invoices-status',
        title: 'Reports and sales',
        steps: [
          {
            title: 'Reports',
            body: '**Reports & Analytics** is built from your completed repair orders: **Completed work by month** (last six months, before tax), **Top parts fitted** this month, and **Technician performance** (orders completed, average time in the workshop, value of completed work).',
          },
          {
            title: 'Sales and payments',
            body: '**Sales** shows zero until payments are set up. Invoices do not show Paid or Overdue yet for the same reason.',
            callout: { kind: 'note', text: 'Payments (online and in store) are coming soon.' },
          },
        ],
      },
      paymentsSection,
    ],
  },

  // 11. Super admin ------------------------------------------------------------------------------------
  {
    id: 'super-admin',
    title: 'Platform admin',
    summary: 'For EuroWerken platform admins only: every workshop, support sessions, suspension and platform settings.',
    icon: ShieldAlert,
    adminOnly: true,
    sections: [
      {
        id: 'super-admin-console',
        title: 'The workshops list',
        page: { to: '/admin', label: 'Open Platform admin' },
        steps: [
          {
            title: 'Open the console',
            body: 'Press **Platform admin** in the sidebar. The **Workshops** tab lists every workshop with its owner, status, activity (staff, customers, appointments, open repairs) and website.',
            shot: shot('admin-workshops', 'The Platform admin Workshops tab with a table of workshops and Open as Manager buttons', 'The platform admin console.'),
          },
          {
            title: 'Filter and search',
            body: 'Use **All**, **Active** and **Suspended**, or **Search workshops**.',
            callout: { kind: 'warning', text: 'Everything you do here is recorded in the audit log.' },
          },
        ],
      },
      {
        id: 'super-admin-open-as-manager',
        title: 'Open a workshop as Manager',
        steps: [
          {
            title: 'Start a support session',
            body: 'Press **Open as Manager** on a workshop. The ERP opens as that workshop\'s Manager, with every rule that applies to a Manager.',
          },
          {
            title: 'The banner',
            body: 'A banner says **Acting as Manager in** the workshop, and that everything you do is recorded. The sidebar shows (support session).',
          },
          {
            title: 'Exit',
            body: 'Press **Exit** in the banner to end the session and go back to the console.',
          },
        ],
      },
      {
        id: 'super-admin-suspend',
        title: 'Suspend or reactivate a workshop',
        steps: [
          {
            title: 'Suspend',
            body: 'Press the suspend button on a workshop, enter the **Reason (required)** and press **Suspend workshop**. Its customer website goes offline and its staff see Workshop suspended.',
          },
          {
            title: 'Reactivate',
            body: 'Press the reactivate button on a suspended workshop to let it back in.',
          },
        ],
      },
      {
        id: 'super-admin-settings',
        title: 'Platform settings and audit log',
        steps: [
          {
            title: 'Platform settings',
            body: 'On **Platform settings**, set the **Platform fee (%)** (0 to 30, for online card payments once they arrive) and the **Support email**, then press **Save**.',
          },
          {
            title: 'Audit log',
            body: 'The **Audit log** tab lists the latest 100 admin actions with the admin, the workshop and the time.',
          },
        ],
      },
    ],
  },

  // 12. Walkthrough ------------------------------------------------------------------------------------
  {
    id: 'walkthrough',
    title: 'Appointment to completion',
    summary: 'One car, start to finish: how the pages work together.',
    icon: Route,
    sections: [
      {
        id: 'walkthrough-booking',
        title: '1. The booking arrives',
        steps: [
          {
            title: 'Online or by phone',
            body: 'The customer books on your website, or you press **New appointment** in Appointments. You get a notification for an online booking.',
          },
          {
            title: 'Confirm it',
            body: 'If it arrives as Requested, open it from **Needs confirming** and press **Confirm**. Assign a technician if you know who will do it.',
          },
        ],
      },
      {
        id: 'walkthrough-check-in',
        title: '2. The car arrives',
        steps: [
          {
            title: 'Check in',
            body: 'Open the booking in the calendar and press **Check in**. The repair order is created; press **Open repair order**.',
          },
          {
            title: 'Share tracking',
            body: 'On the repair order press **Copy customer tracking link** and send it to the customer so they can follow along.',
          },
        ],
      },
      {
        id: 'walkthrough-diagnosis',
        title: '3. Diagnosis and estimate',
        steps: [
          {
            title: 'Start diagnosis',
            body: 'Press **Start diagnosis**. Add photos of what you find with **Upload** and tick **Visible to customer** on the ones they should see.',
          },
          {
            title: 'Build the estimate',
            body: 'In **Add an item**, add the services, parts, labour hours and fees the job needs.',
          },
        ],
      },
      {
        id: 'walkthrough-approval',
        title: '4. The customer approves',
        steps: [
          {
            title: 'Send for approval',
            body: 'Press **Send for approval**, tick the items and send them. The order is Awaiting approval.',
          },
          {
            title: 'Online or by phone',
            body: 'The customer signs in on the tracking page and approves or declines. If they tell you by phone, use **Record phone approval** with a note. When every item is answered, the order moves to In progress.',
          },
        ],
      },
      {
        id: 'walkthrough-repair',
        title: '5. Repair and quality check',
        steps: [
          {
            title: 'Do the work',
            body: 'Keep the customer posted with **Messages** or a timeline note marked **Visible to customer**. Set **Promised for** so they know when to expect the car.',
          },
          {
            title: 'Check it',
            body: 'Press **Quality check** when the work is done.',
          },
        ],
      },
      {
        id: 'walkthrough-pickup',
        title: '6. Ready and completed',
        steps: [
          {
            title: 'Ready for pickup',
            body: 'Press **Ready for pickup**. The customer sees it on the tracking page.',
          },
          {
            title: 'Complete',
            body: 'When they collect the car, press **Complete** on the repair order, and **Complete** on the booking in Appointments.',
            callout: { kind: 'note', text: 'Invoicing and payment at this step are coming soon.' },
          },
        ],
      },
    ],
  },

  // 13. FAQ --------------------------------------------------------------------------------------------
  {
    id: 'faq',
    title: 'FAQ and troubleshooting',
    summary: 'Quick answers to common questions.',
    icon: HelpCircle,
    sections: [
      {
        id: 'faq-missing-page',
        title: 'I cannot see a page in the menu',
        steps: [
          {
            title: 'Your role has no access',
            body: 'The sidebar only shows pages your role can open. Ask a Manager to change your role, or the role\'s access in the permission matrix. Then reload the app.',
          },
        ],
      },
      {
        id: 'faq-cannot-change',
        title: 'I can see a page but cannot change anything',
        steps: [
          {
            title: 'You have View access',
            body: 'View lets you look but not change. Notes like "Changing them needs full Repair Orders access" say which access is needed.',
          },
        ],
      },
      {
        id: 'faq-waiting',
        title: 'I am stuck on Waiting for approval',
        steps: [
          {
            title: 'Ask your manager',
            body: 'A person with full Users & Roles access must assign your role. Once they have, reload the page. Wrong workshop? Press **Wrong workshop? Cancel request**.',
          },
        ],
      },
      {
        id: 'faq-time-not-offered',
        title: 'A time is not offered when booking',
        steps: [
          {
            title: 'Check opening hours and closed dates',
            body: 'Bookings must start within opening hours, on the slot grid, and leave room before closing. Closed weekdays, closed dates and holidays cannot be booked. Check Settings, Booking.',
          },
        ],
      },
      {
        id: 'faq-tracking-link',
        title: 'The customer tracking link does not work',
        steps: [
          {
            title: 'Publish the website',
            body: 'Tracking links need the customer website to be set up and published (Settings, Website). Also check the repair order is not cancelled.',
          },
        ],
      },
      {
        id: 'faq-customer-cannot-approve',
        title: 'The customer cannot approve',
        steps: [
          {
            title: 'They must sign in with the booking email',
            body: 'Approvals need the customer to be signed in with the email the repair was booked with. If that is not possible, use **Record phone approval** with a note.',
          },
        ],
      },
      {
        id: 'faq-no-technicians',
        title: 'No technicians to pick',
        steps: [
          {
            title: 'Add team profiles',
            body: 'The technician lists come from Settings, Team. Add a profile for each technician.',
          },
        ],
      },
      {
        id: 'faq-changed-elsewhere',
        title: '"Changed by someone else in the meantime"',
        steps: [
          {
            title: 'Reopen and try again',
            body: 'Someone else changed the booking while you had it open. Close it, open it again and repeat your change.',
          },
        ],
      },
      {
        id: 'faq-page-error',
        title: '"This page could not be shown"',
        steps: [
          {
            title: 'Try again',
            body: 'Press **Try again** or reload the page. The menu keeps working, so you can go to another page. If it keeps happening, tell your manager what you were doing.',
          },
        ],
      },
    ],
  },
];

/** The guide as one person sees it: platform admin chapters only for platform admins. */
export function visibleChapters(isPlatformAdmin: boolean): GuideChapter[] {
  return GUIDE.filter((c) => isPlatformAdmin || !c.adminOnly);
}

/** All the words of a section, lower case, for search. */
export function sectionText(section: GuideSection): string {
  return [
    section.title,
    section.summary ?? '',
    ...section.steps.flatMap((s) => [s.title, s.body, s.callout?.text ?? '', s.shot?.caption ?? '']),
  ]
    .join(' ')
    .replace(/\*\*/g, '')
    .toLowerCase();
}
