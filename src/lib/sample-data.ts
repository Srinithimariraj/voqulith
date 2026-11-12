import type { NewFeedback, Source } from "./types";

/**
 * SYNTHETIC SAMPLE DATA — written for demo purposes.
 * These are NOT real Zomato customer reviews, and customer IDs are fictional.
 * Includes intentional duplicates (same text posted to two channels, same customer repeating)
 * so the de-duplication rules can be seen working.
 */
type Row = [Source, string | null, string, number | null, string];

const ROWS: Row[] = [
  ["Play Store", "CUST-1001", "2026-10-02", 1, "Order showed 25 mins, arrived after 70 mins. The ETA on Zomato is a total lie every single weekend."],
  ["Play Store", "CUST-1002", "2026-10-02", 2, "Delivery partner kept circling around my building for 20 minutes and the map showed him stuck. Food was cold by the time it came."],
  ["Support Ticket", "CUST-1003", "2026-10-03", null, "My refund for order #48213 was approved 9 days ago and I still haven't received it. Every time I ask, the bot says 5-7 working days."],
  ["Support Ticket", "CUST-1003", "2026-10-08", null, "Third time writing about the refund for order #48213. Still nothing. If this isn't fixed I'm done with Zomato."],
  ["App Store", "CUST-1004", "2026-10-03", 1, "The chat support is just a bot that loops. There is no way to talk to a real person when your order is missing."],
  ["Social Media", "CUST-1005", "2026-10-04", null, "@zomato platform fee went up AGAIN. Small order of ₹180 ended up being ₹265 after all the charges. Switching to Swiggy honestly."],
  ["Play Store", "CUST-1006", "2026-10-04", 5, "Super fast delivery today, biryani reached in 18 minutes and was still hot. Great job delivery partner!"],
  ["Survey / NPS", "CUST-1007", "2026-10-05", 3, "Food is fine but the packaging leaks all the time. My dal makhani spilled all over the bag twice this month."],
  ["Play Store", "CUST-1008", "2026-10-05", 1, "App crashes every time I try to apply a coupon at checkout. Lost my cart three times. Uninstalling."],
  ["Support Ticket", "CUST-1009", "2026-10-05", null, "Received someone else's order. Paneer tikka instead of chicken. The restaurant blames Zomato and Zomato blames the restaurant."],
  ["Email", "CUST-1010", "2026-10-06", null, "I have been a Gold member for 2 years. Lately the Gold discounts don't apply at half the restaurants listed. What am I paying for? I will cancel my Gold membership at renewal."],
  ["App Store", "CUST-1011", "2026-10-06", 4, "Love the new dish recommendations, found two great places nearby. The app feels faster than before."],
  ["Play Store", "CUST-1012", "2026-10-06", 2, "Missing items again. Ordered 2 rotis and a sabzi, got only the sabzi. Refund was partial and took forever."],
  ["Customer Interview", "CUST-1013", "2026-10-07", null, "Honestly I order 4-5 times a week. What frustrates me most is the delivery time estimate jumping from 30 to 55 minutes after I've paid."],
  ["Social Media", "CUST-1014", "2026-10-07", null, "Paid ₹40 for 'rain surge' when it wasn't even raining in my area. These hidden charges are getting ridiculous."],
  ["Support Ticket", "CUST-1015", "2026-10-07", null, "Payment got deducted from my UPI but order failed. It's been 4 days, money not back. Please help."],
  ["Play Store", "CUST-1016", "2026-10-08", 1, "Worst customer support. The bot closed my complaint automatically without resolving anything."],
  ["Survey / NPS", "CUST-1017", "2026-10-08", 9, "Offers on weekdays are really good. I recommend Zomato to friends mostly for the deals."],
  ["Play Store", "CUST-1001", "2026-10-09", 1, "Again 40 minutes late. Second weekend in a row. The ETA on Zomato is a total lie every weekend."],
  ["App Store", "CUST-1018", "2026-10-09", 2, "Ice cream arrived completely melted. No insulated bags? For dessert orders this should be basic."],
  ["Support Ticket", "CUST-1019", "2026-10-09", null, "I want a refund for my cold pizza. The support only offered ₹30 Zomato credits which I don't want. I want my money back to my card."],
  ["Social Media", "CUST-1020", "2026-10-10", null, "Uninstalled Zomato today. Late deliveries, cold food and no real support. Not worth the fees anymore."],
  ["Play Store", "CUST-1021", "2026-10-10", 3, "Search is bad. I type 'momos' and get pizza places first. Filters reset every time I go back."],
  ["Email", "CUST-1022", "2026-10-10", null, "I was charged twice for the same order (#50917). Raised a ticket 6 days ago, no response yet. Very disappointed."],
  ["Play Store", "CUST-1023", "2026-10-11", 5, "Delivery partner was very polite and called before arriving. Order was accurate. Happy customer."],
  ["Survey / NPS", "CUST-1024", "2026-10-11", 4, "Gold is still worth it for me because of free delivery, but restaurant selection under Gold has reduced."],
  ["App Store", "CUST-1025", "2026-10-11", 1, "App logs me out randomly and asks for OTP again and again. OTP takes minutes to arrive."],
  ["Support Ticket", "CUST-1026", "2026-10-12", null, "Order marked as delivered but I never received it. Delivery partner not reachable. Need full refund immediately."],
  ["Play Store", "CUST-1027", "2026-10-12", 2, "Packaging is so bad that the curry leaked into the rice. Restaurant packing quality should be monitored."],
  ["Social Media", "CUST-1005", "2026-10-12", null, "Zomato platform fee went up again. Small order of ₹180 ended up being ₹265 after all the charges. Switching to Swiggy honestly."],
  ["Customer Interview", "CUST-1028", "2026-10-13", null, "As a working mom I rely on scheduled orders. Twice this month the scheduled order was cancelled 10 minutes before the slot with no explanation."],
  ["Play Store", "CUST-1029", "2026-10-13", 1, "Refund process is a nightmare. I uploaded photos of the spilled food and they still rejected my refund."],
  ["App Store", "CUST-1030", "2026-10-13", 5, "Easy to reorder my usuals. Live tracking is accurate in my area. 5 stars."],
  ["Support Ticket", "CUST-1031", "2026-10-14", null, "The restaurant cancelled my order after 35 minutes of waiting. I had to start over and order elsewhere. Very poor experience."],
  ["Play Store", "CUST-1032", "2026-10-14", 2, "Delivery fees are higher than the food sometimes. ₹69 delivery for 2 km? Seriously?"],
  ["Survey / NPS", "CUST-1033", "2026-10-14", 2, "I will probably move to Swiggy Instamart and Swiggy food because their delivery is faster in my locality."],
  ["Email", "CUST-1034", "2026-10-15", null, "Wrong item delivered for the third time this month. Each time I complain, I get a generic apology. Nothing changes."],
  ["Play Store", "CUST-1035", "2026-10-15", 3, "The app is good but notifications are spammy. 6 promo notifications a day is too much."],
  ["Support Ticket", "CUST-1036", "2026-10-15", null, "Refund of ₹642 for cancelled order still not credited after 12 days. Your support chat keeps saying 'escalated'. Please cancel my Gold membership and refund that too."],
  ["App Store", "CUST-1037", "2026-10-16", 1, "Coupon shows applied but final bill doesn't reflect the discount. Feels like a scam."],
  ["Play Store", "CUST-1038", "2026-10-16", 4, "Good variety of restaurants and the hygiene ratings are helpful. Wish delivery was a bit quicker."],
  ["Social Media", "CUST-1039", "2026-10-16", null, "@zomato your bot told me my missing order complaint was 'resolved'. It was not. I am still hungry and out ₹450."],
  ["Customer Interview", "CUST-1040", "2026-10-17", null, "I don't trust the ETA anymore. I now add 20 minutes in my head whenever the app shows a time."],
  ["Play Store", "CUST-1041", "2026-10-17", 1, "Payment failed 3 times with my credit card but amount got blocked each time. Uninstalling this app."],
  ["Survey / NPS", "CUST-1042", "2026-10-17", 6, "Prices on Zomato are 20-30% higher than in the restaurant menu. I only order when there is a big offer now."],
  ["App Store", "CUST-1043", "2026-10-18", 5, "Customer support resolved my missing item issue within 5 minutes and refunded instantly. Impressed."],
  ["Play Store", "CUST-1044", "2026-10-18", 2, "Food arrived cold and soggy. The delivery partner picked up two other orders on the way."],
  ["Support Ticket", "CUST-1012", "2026-10-18", null, "Missing items again in order #51344. This is the second time in two weeks. I am tired of chasing refunds."],
  ["Play Store", "CUST-1045", "2026-10-19", 1, "Cannot change delivery address after placing order even though the rider hadn't picked it up yet. Had to cancel and lost money."],
  ["Email", "CUST-1046", "2026-10-19", null, "Hi team, the Zomato Gold renewal charged me automatically without any reminder. I want a refund and to turn off auto-renew."],
  ["App Store", "CUST-1047", "2026-10-19", 3, "Dark mode please. Also the order history is hard to search."],
  ["Play Store", "CUST-1048", "2026-10-20", 1, "Zero accountability for late delivery. 1 hour 20 mins for a pizza from 3 km away. No compensation offered."],
  ["Survey / NPS", "CUST-1049", "2026-10-20", 8, "Overall convenient. Tracking and the variety keep me coming back, though fees are creeping up."],
  ["Support Ticket", "CUST-1050", "2026-10-20", null, "My refund for order #48213 was approved 9 days ago and I still haven't received it. Every time I ask, the bot says 5-7 working days."],
  ["Play Store", null, "2026-10-21", 2, "Rider asked me to come down to the gate in the rain because he 'can't find the building'. The pin was correct."],
  ["App Store", null, "2026-10-21", 1, "Hidden charges everywhere — packaging fee, platform fee, small cart fee. Show the full price upfront!"],
  ["Play Store", "CUST-1051", "2026-10-21", 5, "Zomato Everyday meals are affordable and tasty. Perfect for office lunches."],
  ["Social Media", "CUST-1052", "2026-10-22", null, "Third complaint this week about late delivery and nobody from Zomato has called back. Deleting the app."],
];

export function buildSampleFeedback(): NewFeedback[] {
  return ROWS.map(([source, customer, date, rating, text]) => ({
    source,
    customer: customer ?? undefined,
    date,
    rating: rating ?? undefined,
    text,
    origin: "sample",
    fileName: "Synthetic Zomato sample",
  }));
}

export const SAMPLE_COUNT = ROWS.length;
