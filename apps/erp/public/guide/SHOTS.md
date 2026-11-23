# Help guide screenshots

The in-app guide (`/help`, content in `src/pages/help/guideContent.ts`) shows these images from this folder.
A missing file shows a placeholder with its description, so they can be added one at a time.

How to take them:

- PNG, desktop width 1280 px (crop to the part described), light mode unless noted. Retina (2x) is fine.
- Use a demo workshop with made-up customers, cars and plates. No real names, emails, phone numbers or VINs.
- Save under exactly the file name below. Each name is used once in the guide.

| # | File | Page or route | What it should show |
|---|------|---------------|---------------------|
| 1 | `sign-in.png` | `/login` | The Sign in page: Work email and Password fields, Forgot password?, Continue, Continue with Google, Create an account. |
| 2 | `register-create-workshop.png` | `/register` | Create an account with **Create new** selected and a Workshop name filled in (for example Bravo Motors). |
| 3 | `register-join-workshop.png` | `/register` | Create an account with **Join existing** selected and a 6-digit Workshop number filled in. |
| 4 | `waiting-for-approval.png` | any page, signed in as a user with no role | The "Waiting for approval" message with the "Wrong workshop? Cancel request" button. |
| 5 | `invite-accept.png` | `/invite/<token>`, signed in as the invited email | "Join <workshop>" with the "Accept and join as Technician" button. |
| 6 | `layout-overview.png` | `/dashboard` | The whole window: sidebar (workshop name and number, menu, Help, user and sign-out), header with page title, bell with an unread count, and the theme button. |
| 7 | `dashboard.png` | `/dashboard` | KPI tiles, Today's appointments with a few bookings, Revenue trend and Stock alerts. |
| 8 | `appointments-week.png` | `/appointments` (Week) | Week view with bookings in several statuses (Requested, Confirmed, Checked in, a struck-through Cancelled) and a closed day labelled. |
| 9 | `appointments-day.png` | `/appointments`, Day view | One day as a timeline with a few bookings and the red Now line. |
| 10 | `appointments-needs-confirming.png` | `/appointments` | The "Needs confirming" card with two or three online requests and their Open buttons, plus the four KPI tiles above. |
| 11 | `appointments-new.png` | `/appointments`, New appointment dialog | The form filled in: Contact, Car, two services ticked, When (date, start time, duration), Technician and Status. |
| 12 | `appointment-details.png` | `/appointments`, a Requested booking opened | The Booking dialog top: status badges, Confirm and Decline buttons, Contact, Car, Services and estimate. |
| 13 | `appointment-reschedule.png` | `/appointments`, a Confirmed booking opened | The Reschedule section with a new date and time chosen and the Move booking and Undo changes buttons. |
| 14 | `appointment-checked-in.png` | `/appointments`, right after Check in | The green note "Repair order RO-0001 created" with the "Open repair order RO-0001" link. |
| 15 | `repair-orders-list.png` | `/repair-orders` | Status filter buttons with counts, the search box and a table of several orders in different statuses, one with an amount "waiting". |
| 16 | `repair-order-header.png` | `/repair-orders/<id>` | The header card: RO number, status badge, car with plate, customer contact, tracking code with copy button and "Copy customer tracking link". |
| 17 | `repair-order-progress.png` | `/repair-orders/<id>`, status Checked in or Diagnosing | The Progress card with the seven numbered steps and the action buttons (Start diagnosis, Start repair, Cancel repair order). |
| 18 | `repair-order-line-items.png` | `/repair-orders/<id>` | Line items with a service, a part and labour; badges Approved, Waiting for customer and Declined (struck through); totals with GST 5% and "Waiting for customer (not included)". |
| 19 | `repair-order-add-item.png` | `/repair-orders/<id>` | The "Add an item" form with Part selected, a part chosen from the list and the line total shown. |
| 20 | `repair-order-ask-approval.png` | `/repair-orders/<id>`, after "Ask customer to approve" | The yellow selection note, items with checkboxes (two ticked) and the "Send 2 for approval" button. |
| 21 | `repair-order-phone-approval.png` | `/repair-orders/<id>`, items waiting for the customer | The "Record phone approval" form: items chosen, approve or decline, and a note such as "Spoke to the customer at 2:15 PM". |
| 22 | `repair-order-media.png` | `/repair-orders/<id>` | Photos and video with three tiles (one video), captions, and "Visible to customer" ticked on some. |
| 23 | `repair-order-messages.png` | `/repair-orders/<id>` | The Messages card with a short exchange: staff on the right, customer on the left. |
| 24 | `repair-order-timeline.png` | `/repair-orders/<id>` | The Timeline with check-in, status changes, an approval and a note, showing "Customer can see this" and "Staff only", plus the Add note form. |
| 25 | `customers-list.png` | `/customers` | The search box, the customer count and the table (name, phone, vehicles, Customer since). |
| 26 | `customer-details.png` | `/customers`, a customer opened | The customer dialog: Contact and two vehicles with plate and VIN. |
| 27 | `inventory-list.png` | `/inventory` | Search, category tabs, and parts with In stock, Low stock and Out of stock badges, Published and Hidden. |
| 28 | `inventory-part-form.png` | `/inventory`, Add part | The part dialog: name, brand, photos, Price and stock section. |
| 29 | `users-invite.png` | `/users` | The workshop number card and "Invite someone" with a just-created link (Copy button) and an open invite listed below. |
| 30 | `users-team.png` | `/users` | The Team table with one member "Awaiting approval" at the top and others with role pickers and Deactivate buttons. |
| 31 | `users-permissions.png` | `/users`, signed in as Manager | The Role permissions matrix with None, View and Full pickers, "Reset to default" under each role and "Reset all roles to defaults". |
| 32 | `settings-opening-hours.png` | `/settings?tab=booking` | The Opening hours card: weekdays with times, Sunday ticked Closed, and a day with a second period (closed over lunch). |
| 33 | `settings-closed-dates.png` | `/settings?tab=booking` | The Closed dates card with a few dates, and the "Add Canadian holidays" dialog open with statutory holidays ticked. |
| 34 | `settings-booking.png` | `/settings?tab=booking` | The Online booking card: time zone, slot length, bays, minimum notice, booking window, labour rate, holiday region and "Confirm online bookings automatically". |
| 35 | `settings-website.png` | `/settings` (Website) | The Customer website card top: Published badge, name, web address, brand colour, headline and word to colour. |
| 36 | `settings-website-navigation.png` | `/settings` (Website) | The Navigation choice: "Liquid glass tab bar" and "Classic header menu". |
| 37 | `settings-services.png` | `/settings?tab=services` | The Services list grouped by category with prices, durations, a Popular badge and an Active/Hidden service. |
| 38 | `settings-team.png` | `/settings?tab=team` | The Team list of technician profiles with photos, Public and Hidden badges. |
| 39 | `notifications-bell.png` | any page | The notification panel open under the bell: unread items (bold, with a dot) and "Mark all as read". |
| 40 | `admin-workshops.png` | `/admin`, platform admin | The Workshops tab: search, All/Active/Suspended filters, the table with Open as Manager. Dark mode is fine here. |
