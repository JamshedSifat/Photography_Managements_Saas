# 📸 Photography Studio Management SaaS

A modern, full-stack **Photography Studio Management SaaS** designed to manage the complete studio workflow — from client management and photographer scheduling to bookings, payments, contracts, private galleries, notifications, and real-time communication.

> Built as a production-oriented portfolio project with a focus on real-world studio operations, role-based workflows, secure client delivery, and a polished SaaS experience.

## ✨ Core Features

### 🔐 Authentication & Role-Based Access
- Secure authentication with access/refresh tokens
- Three roles:
  - **Admin**
  - **Photographer**
  - **Client**
- Protected role-based dashboards and actions
- Profile management with photographer information

### 👥 Client Management
- Client profiles and contact information
- Booking history
- Payment history
- Total spending and outstanding balance
- Notes and tags
- Client search and management

### 📦 Photography Package Management
- Create and manage photography packages
- Package categories
- Pricing
- Duration
- Deposit percentage
- Features and deliverables
- Cover images
- Popular/active package controls

### 📅 Booking & Scheduling
- Online booking management
- Unique booking references
- Date and time scheduling
- Location and notes
- Photographer assignment
- Booking availability checking
- Double-booking prevention
- Configurable 1-hour slot interval
- Studio working days and hours
- Minimum booking notice
- Maximum advance-booking window

### 👨‍🎨 Photographer Portfolio
Each photographer can have a public professional profile containing:
- Profile photo
- Headline and bio
- Experience
- Location
- Specialties
- Previous work / portfolio
- Completed project count
- Ratings and reviews
- Availability
- Next available date

Clients can explore photographer profiles and previous work before choosing a photographer.

### 🗓️ Photographer Availability
- Weekly working hours
- Available/blocked dates
- Holidays
- Break periods
- Leave requests
- Admin leave approval/rejection
- Availability overrides

### 🔔 Real-Time Notification Center
Persistent in-app notifications for:
- New bookings
- Booking approval/rejection
- Booking status changes
- Photographer assignment
- Payment submission
- Payment verification/rejection
- Payment due reminders
- Gallery uploads
- Gallery ready
- Booking cancellation
- New chat messages
- Reviews
- Leave status updates

Includes unread counts, read/unread state, notification history, and links to related records.

### 💬 Real-Time In-App Chat
Booking-based private chat between:
- Client
- Assigned Photographer
- Admin

Features include:
- Real-time message delivery
- Persistent message history
- Text messages
- Image attachments
- File attachments
- Seen/read tracking
- Typing state
- Message timestamps
- Unread counts
- Chat notifications

Real-time updates are implemented with **Server-Sent Events (SSE)** and persisted in PostgreSQL so message/notification history can be restored after reconnecting.

### 💳 Manual Payment Management
Supports manual mobile-money payment verification without requiring a payment gateway API.

Payment workflow:
1. Client submits payment information.
2. Transaction details are stored as pending verification.
3. Admin reviews the payment.
4. Admin verifies or rejects it.
5. Payment status and booking balances are updated.

Supports:
- Advance payment
- Balance payment
- Full payment
- Refunds
- bKash
- Nagad
- Bank transfer
- Cash
- Online/card methods
- Transaction ID
- Sender number
- Payment screenshot
- Verification timestamp
- Rejection reason
- Payment history
- PDF receipts
- Duplicate transaction ID protection

### 🖼️ Private Client Galleries
Secure galleries connected to bookings and clients.

Features:
- Cloudinary-based photo storage
- Multiple photo uploads
- Thumbnail and preview URLs
- Favorites
- Gallery publishing
- Download permissions
- Watermark setting
- Gallery expiration
- Download expiration
- Download tracking
- Client gallery access verification
- Gallery comments
- Gallery activity history
- Gallery extension requests

### 🔐 Gallery Access & Security
- OTP-based gallery access
- Expiring gallery access
- Download controls
- Watermark support
- Download activity logging
- Client-specific gallery permissions

### 📝 Digital Contracts & E-Signature
Complete contract workflow:
- Contract generation per booking
- Secure invitation token
- OTP verification
- OTP expiry and attempt tracking
- Typed signature
- Drawn signature
- Signer information
- Signature timestamp
- IP/user-agent tracking
- PDF contract generation
- Contract email workflow

### ⭐ Reviews & Ratings
After a completed booking:
- Client can submit a rating
- Client can write a review
- Photographer rating aggregates are maintained
- Reviews appear on photographer profiles

### 📊 Role-Based Dashboards

#### Admin Dashboard
- Today's shoots
- Upcoming bookings
- Monthly revenue
- Outstanding payments
- Client statistics
- Published/draft galleries
- Revenue trends
- Booking status breakdown
- Team workload
- Recent payments
- Upcoming and recent bookings

#### Photographer Dashboard
- Today's shoots
- Weekly schedule
- Monthly completed sessions
- Sessions waiting for delivery
- Upcoming bookings
- Assigned work

#### Client Dashboard
- Upcoming bookings
- Next session
- Outstanding balance
- Galleries
- Payment history
- Session history

### 📧 Email & Communication
Email workflows support:
- Welcome emails
- Booking confirmations
- Booking reminders
- Rescheduling notifications
- Cancellation notifications
- Gallery-ready notifications
- Payment receipts
- Contract invitations
- Contract OTP
- Contract signed notifications
- Gallery OTP
- Leave status updates
- Gallery extension notifications

Email activity is logged for tracking delivery status and errors.

### 🧾 Invoices & PDF Documents
- Unique invoice numbers
- Booking invoices
- Payment receipts
- Contract PDFs
- Studio invoice notes
- PDF document generation

## 🛠️ Tech Stack

### Frontend
- Next.js 16
- React 19
- Tailwind CSS
- SWR
- Lucide React
- Sonner

### Backend / Application
- Next.js Route Handlers
- Server-side application logic
- REST-style API endpoints
- Server-Sent Events (SSE)

### Database
- PostgreSQL
- Drizzle ORM
- Drizzle Kit

### Authentication & Security
- JWT-style access/refresh token authentication
- `jose`
- `bcryptjs`
- Zod validation
- Role-based authorization

### Media & Documents
- Cloudinary
- PDFKit
- Image/file attachment support

### Email
- Nodemailer

## 🗂️ Main Data Domains

The database is structured around the major studio workflows:

- Users
- Clients
- Packages
- Bookings
- Booking Events
- Payments
- Notifications
- Chat Rooms
- Chat Messages
- Chat Read/Typing State
- Photographer Availability
- Availability Overrides
- Leave Requests
- Reviews
- Galleries
- Photos
- Gallery Comments
- Gallery Activities
- Gallery Downloads
- Gallery Extension Requests
- Gallery Access OTPs
- Contracts
- Email Logs
- Studio Settings

## 🔄 Booking Lifecycle

```text
Pending
   ↓
Approved
   ↓
Photographer Assigned
   ↓
Shooting
   ↓
Editing
   ↓
Gallery Ready
   ↓
Completed
```

A booking can also be cancelled according to the allowed workflow.

## 💰 Payment Lifecycle

```text
Payment Submitted
       ↓
Pending Verification
       ↓
Admin Review
   ↙         ↘
Rejected     Paid
                ↓
        Receipt Generated
```

## 🖼️ Gallery Workflow

```text
Booking
   ↓
Gallery Created
   ↓
Photos Uploaded
   ↓
Gallery Published
   ↓
Client Access
   ↓
Preview / Favorite / Comment
   ↓
Secure Download
```

## 🔔 Real-Time Architecture

The application uses **Server-Sent Events (SSE)** for live server-to-client updates.

Important events such as chat messages and notifications are persisted first and then pushed to connected clients. This allows the application to resynchronize through the API after a reconnect instead of losing history.

## 🎯 Project Goals

This project focuses on solving real photography-studio operational problems:

- Reduce manual booking management
- Prevent scheduling conflicts
- Centralize client information
- Track photographer availability
- Manage payments and outstanding balances
- Digitize contracts and signatures
- Deliver photos securely
- Improve client-photographer communication
- Provide real-time operational updates
- Give studio administrators a centralized management dashboard

## 🚀 Getting Started

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

Create a `.env.local` file and configure the required database, authentication, Cloudinary, and email settings used by the application.

### 4. Prepare the database

Use the project's Drizzle configuration and migration/push workflow to initialize the PostgreSQL database.

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

## 📁 Project Structure

```text
Photography_Managements_Saas/
├── src/
│   ├── app/              # Next.js application routes/pages
│   ├── components/       # Reusable UI components
│   ├── db/               # Database schema and database logic
│   └── lib/               # Shared types, auth, realtime and utilities
├── drizzle/              # Database migrations/schema artifacts
├── scripts/              # Project scripts
├── package.json
├── drizzle.config.ts
├── next.config.ts
└── tsconfig.json
```

## 🌐 Live Demo

**Live Application:**  
https://photography-managements-saas.vercel.app/

## 💻 Repository

**GitHub:**  
https://github.com/JamshedSifat/Photography_Managements_Saas

## 📌 Project Status

This project is actively developed and continuously improved with additional studio-management workflows and production-focused refinements.

## 👨‍💻 Author

**Jamshed Sifat**

Full Stack Developer | React • Next.js • PostgreSQL | Building Production-Ready Projects

---

⭐ If you find this project useful or interesting, consider giving the repository a star.
