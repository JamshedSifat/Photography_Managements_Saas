<div align="center">

# 📸 Photography Management SaaS

### A production-ready photography studio management platform for bookings, photographers, payments, private galleries, contracts, notifications, and real-time communication.

<p>
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge" />
</p>

<p>
  <a href="https://photography-managements-saas.vercel.app/">🌐 Live Demo</a>
  &nbsp;•&nbsp;
  <a href="https://github.com/JamshedSifat/Photography_Managements_Saas">💻 GitHub</a>
</p>

<br />

<img src="./screenshots/hero.png" width="100%" alt="Photography Management SaaS Dashboard"/>

</div>

---

## ✨ Overview

Photography Management SaaS is a full-stack platform designed to manage the complete workflow of a professional photography studio.

Instead of using separate tools for bookings, photographers, payments, galleries, contracts, notifications, and client communication, the platform brings these workflows together in one system.

### 🎯 Core Workflow

```text
Client
   │
   ▼
Browse Packages
   │
   ▼
Create Booking
   │
   ▼
Booking Approval
   │
   ▼
Photographer Assignment
   │
   ▼
Photography Session
   │
   ▼
Editing
   │
   ▼
Private Gallery
   │
   ▼
Payment / Invoice
   │
   ▼
Contract & E-Sign
   │
   ▼
Completed Booking
```

---

# 📸 Product Showcase

## 🖥️ Dashboard

<img src="./screenshots/admin-dashboard.png" width="100%" alt="Admin Dashboard"/>

The admin dashboard provides a centralized overview of studio operations, bookings, payments, photographers, clients, notifications, and activity.

---

## 📅 Booking & Scheduling

<table>
<tr>
<td width="50%">

<img src="./screenshots/booking.png" width="100%" alt="Booking Management"/>

<p align="center"><b>Booking Management</b></p>

</td>
<td width="50%">

<img src="./screenshots/calendar.png" width="100%" alt="Calendar"/>

<p align="center"><b>Studio Calendar</b></p>

</td>
</tr>
</table>

### Booking capabilities

- Online booking
- Package selection
- Date and time selection
- Location
- Client notes
- Photographer assignment
- Booking status management
- Double-booking prevention
- Booking timeline
- Automated reminders
- Invoice generation

---

# 👨‍🎨 Photographer Management

<img src="./screenshots/photographer.png" width="100%" alt="Photographer Profile"/>

Photographers have dedicated profiles containing:

- Professional headline
- Experience
- Specialties
- Portfolio
- Location
- Rating
- Availability
- Assigned bookings
- Completed projects

### Availability Management

The system supports:

- Weekly working hours
- Break periods
- Leave requests
- Blocked dates
- Availability overrides
- Minimum booking notice
- Maximum advance booking period
- Configurable booking slot intervals

---

# 💳 Payment Management

<img src="./screenshots/payment.png" width="100%" alt="Payment Management"/>

The platform supports manual payment workflows including **bKash** payment submission and admin verification.

### Payment Flow

```text
Client
  │
  ├── Pays manually
  │
  ├── Submits transaction ID
  │
  ├── Adds payment amount
  │
  └── Optional screenshot
          │
          ▼
       Admin
          │
     ┌────┴────┐
     ▼         ▼
  Verify     Reject
     │
     ▼
 Payment Confirmed
```

### Payment Features

- Advance payment
- Balance payment
- Full payment
- Manual bKash submission
- Transaction ID
- Payment screenshot
- Duplicate transaction prevention
- Admin verification
- Rejection reason
- Payment status tracking
- PDF receipts
- Payment notifications

---

# 🖼️ Private Client Gallery

<img src="./screenshots/gallery.png" width="100%" alt="Private Client Gallery"/>

The gallery system provides a secure environment for clients to access their photography deliverables.

### Gallery Features

- Cloudinary-powered storage
- Private client galleries
- Multiple photo uploads
- Upload progress
- Cover image
- Favorites
- Watermark support
- Download permissions
- Gallery expiry
- Download expiry
- Download tracking
- Client comments
- Gallery activity tracking
- OTP-based gallery access
- Gallery extension requests

---

# 💬 Real-Time Booking Chat

<table>
<tr>
<td width="60%">

<img src="./screenshots/chat.png" width="100%" alt="Real Time Chat"/>

</td>

<td width="40%">

### Communication

Clients, photographers, and admins can communicate through booking-specific private chat rooms.

**Supported messages:**

- 💬 Text
- 🖼️ Images
- 📎 Files
- 👁️ Seen status
- ⌨️ Typing indicator
- 🔔 Unread count
- 🔎 Message search

</td>
</tr>
</table>

### Real-Time Architecture

The application uses **Server-Sent Events (SSE)** for real-time updates.

```text
Client
   │
   │ HTTP Request
   ▼
Next.js Route Handler
   │
   ├── Persist data
   │
   ▼
PostgreSQL
   │
   ▼
Realtime Publisher
   │
   ▼
SSE Stream
   │
   ▼
Connected Clients
```

Messages and notifications are persisted first and then published to connected clients.

---

# 🔔 Notification Center

<img src="./screenshots/notifications.png" width="100%" alt="Notification Center"/>

The notification system keeps users informed about important studio events.

### Notification Events

- New booking
- Booking approval
- Booking rejection
- Photographer assignment
- Booking status changes
- Payment submitted
- Payment verified
- Payment rejected
- Payment due
- Gallery uploaded
- Gallery ready
- Booking cancellation
- New chat message
- New review
- Leave status
- System notifications

Users can:

- View notification history
- See unread count
- Mark individual notifications as read
- Mark all notifications as read
- Navigate directly to related records

---

# 📝 Digital Contract & E-Signature

<img src="./screenshots/contract.png" width="100%" alt="Digital Contract"/>

The platform includes a digital contract workflow for photography bookings.

### Contract Flow

```text
Email Invitation
       │
       ▼
   Secure Link
       │
       ▼
      OTP
       │
       ▼
     Contract
       │
       ▼
    Signature
       │
       ▼
 Signed Contract PDF
```

### Contract Security

- Secure invitation token
- OTP verification
- OTP expiry
- Attempt limits
- Typed signature
- Drawn signature
- Signer information
- Timestamp
- IP address
- User-agent tracking
- Signed PDF generation
- Email delivery

---

# ⭐ Reviews & Ratings

<img src="./screenshots/reviews.png" width="100%" alt="Reviews and Ratings"/>

Clients can submit reviews after completing a booking.

The system tracks:

- Rating
- Review text
- Reviewer
- Booking
- Photographer
- Review notifications

Photographer profiles can display aggregated rating information.

---

# 📊 Role-Based Dashboards

## 👑 Admin

<img src="./screenshots/admin-dashboard.png" width="100%" alt="Admin Dashboard"/>

Admins can manage:

- Clients
- Photographers
- Packages
- Bookings
- Payments
- Galleries
- Contracts
- Reviews
- Notifications
- Studio settings
- Availability
- Leave requests
- Booking events

---

## 📸 Photographer

<img src="./screenshots/photographer-dashboard.png" width="100%" alt="Photographer Dashboard"/>

Photographers can manage:

- Assigned bookings
- Availability
- Portfolio
- Client communication
- Booking chat
- Shooting workflow
- Editing workflow
- Gallery-related activities
- Profile information

---

## 👤 Client

<img src="./screenshots/client-dashboard.png" width="100%" alt="Client Dashboard"/>

Clients can:

- Browse packages
- Create bookings
- Track booking status
- Make payment submissions
- View invoices
- Access private galleries
- Favorite photos
- Download photos
- Comment on gallery photos
- Sign contracts
- Chat with photographers/admins
- Receive notifications
- Submit reviews

---

# 🔄 Booking Lifecycle

```text
┌─────────┐
│ Pending │
└────┬────┘
     ▼
┌──────────┐
│ Approved │
└────┬─────┘
     ▼
┌──────────────────────┐
│ Photographer Assigned│
└──────────┬───────────┘
           ▼
     ┌──────────┐
     │ Shooting │
     └────┬─────┘
          ▼
     ┌─────────┐
     │ Editing │
     └────┬────┘
          ▼
  ┌────────────────┐
  │ Gallery Ready  │
  └───────┬────────┘
          ▼
    ┌───────────┐
    │ Completed │
    └───────────┘
```

Bookings can also be cancelled when applicable.

---

# 🗃️ Data Architecture

The application uses PostgreSQL with Drizzle ORM.

Major data domains include:

```text
Users
 ├── Clients
 └── Photographers

Packages
 │
 └── Bookings
       ├── Payments
       ├── Contracts
       ├── Reviews
       ├── Booking Events
       ├── Chat Room
       └── Gallery
             ├── Photos
             ├── Comments
             ├── Activities
             ├── Downloads
             └── Access OTPs

Users
 └── Notifications
```

---

# 🛠️ Tech Stack

## Frontend

| Technology | Purpose |
|---|---|
| Next.js | Full-stack React framework |
| React | User interface |
| TypeScript | Type safety |
| Tailwind CSS | UI styling |
| SWR | Data fetching and synchronization |

## Backend

| Technology | Purpose |
|---|---|
| Next.js Route Handlers | API/backend |
| Drizzle ORM | Database access |
| PostgreSQL | Primary database |
| Zod | Validation |
| Jose | Authentication/security |
| bcryptjs | Password hashing |
| SSE | Real-time communication |

## Services & Infrastructure

| Technology | Purpose |
|---|---|
| Cloudinary | Image and gallery storage |
| Nodemailer | Email delivery |
| PDFKit | PDF generation |
| Vercel | Deployment |

---

# 🧩 Core Modules

```text
Authentication
       │
       ├── Admin
       ├── Photographer
       └── Client
       
Booking Management
       │
       ├── Packages
       ├── Calendar
       ├── Availability
       └── Photographer Assignment

Financial Management
       │
       ├── Payments
       ├── Verification
       └── Receipts

Gallery Management
       │
       ├── Cloudinary
       ├── Favorites
       ├── Downloads
       └── Comments

Communication
       │
       ├── Chat
       ├── Notifications
       └── Email

Contracts
       │
       ├── OTP
       ├── Signature
       └── PDF
```

---

# 📁 Project Structure

```text
src/
├── app/
│   ├── api/
│   ├── admin/
│   ├── photographer/
│   ├── client/
│   └── ...
│
├── components/
│
├── db/
│   └── schema.ts
│
├── lib/
│   ├── realtime.ts
│   ├── shared.ts
│   └── ...
│
└── ...
```

---

# 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/JamshedSifat/Photography_Managements_Saas.git

cd Photography_Managements_Saas
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create:

```text
.env.local
```

Configure the required database, authentication, Cloudinary, email, and application settings.

### 4. Push database schema

```bash
npx drizzle-kit push
```

### 5. Start development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# 🌐 Deployment

The application is designed for modern cloud deployment and can be deployed with:

- Vercel
- PostgreSQL-compatible hosted databases
- Cloudinary
- SMTP/email provider

Production environment variables should be configured through the deployment platform.

---

# 🔐 Security Considerations

The system includes multiple security-oriented mechanisms:

- Password hashing
- Role-based access
- Secure authentication tokens
- OTP verification
- Expiring invitation links
- Gallery access controls
- Private media handling
- Duplicate payment transaction prevention
- Contract signer metadata
- IP/user-agent tracking
- Server-side validation
- Database persistence before realtime publishing

---

# 📈 Future Improvements

Potential future extensions include:

- Advanced analytics
- Revenue reports
- Photographer performance analytics
- Automated invoice reminders
- SMS notifications
- WhatsApp integration
- AI-assisted client mood boards
- Advanced team management
- Automated backup system
- More payment gateway integrations
- Advanced gallery sharing controls

---

# 🎯 Why This Project?

Photography studios often need multiple tools to manage:

```text
Bookings
   +
Photographers
   +
Payments
   +
Contracts
   +
Client Communication
   +
Photo Delivery
   +
Notifications
```

This project combines these workflows into a unified SaaS platform.

---

# 📸 More Screenshots

<table>
<tr>
<td width="50%">
<img src="./screenshots/packages.png" width="100%" />
<p align="center"><b>Photography Packages</b></p>
</td>

<td width="50%">
<img src="./screenshots/availability.png" width="100%" />
<p align="center"><b>Photographer Availability</b></p>
</td>
</tr>

<tr>
<td width="50%">
<img src="./screenshots/invoice.png" width="100%" />
<p align="center"><b>Invoice</b></p>
</td>

<td width="50%">
<img src="./screenshots/profile.png" width="100%" />
<p align="center"><b>Photographer Profile</b></p>
</td>
</tr>
</table>

---

# 🌐 Live Demo

<div align="center">

### Try the application

**[🚀 Open Live Demo](https://photography-managements-saas.vercel.app/)**

**[💻 View Source Code](https://github.com/JamshedSifat/Photography_Managements_Saas)**

</div>

---

# 👨‍💻 Author

<div align="center">

### Jamshed Sifat

Full Stack Developer

Building production-ready web applications with modern technologies.

</div>

---

<div align="center">

### ⭐ If you find this project interesting, consider giving it a star!

Made with ❤️ for modern photography studio management.

</div>
