require("dotenv").config({ path: ".env.dev" });

const LeadSquaredService = require("../utils/leadsquared.service");

async function main() {
  try {
    console.log("Testing LeadSquared getOpportunitiesByPhone service...");

    // Example phone number in the expected format (+91-XXXXXXXXXX)
    const testPhone = "+91-9711469568";

    console.log(`Looking up opportunities with phone: ${testPhone}`);

    const result = await LeadSquaredService.getLeadsByIds([
      "712339ab-a7ed-44a4-b175-0551d8f1333c",
    ]);

    console.log("LeadSquared Response:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error testing getOpportunitiesByPhone:");
    console.error("Message:", error.message);

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
  }
}

// Run the test
main();
