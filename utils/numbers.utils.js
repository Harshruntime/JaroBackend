function formatCurrency(num) {
    if (num >= 1e7) {
        // 1 Crore
        return "₹" + (num / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr";
    }
    if (num >= 1e5) {
        // 1 Lakh
        return "₹" + (num / 1e5).toFixed(1).replace(/\.0$/, "") + "L";
    }
    if (num >= 1e3) {
        // 1 Thousand
        return "₹" + (num / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return num.toLocaleString("en-IN"); // Adds Indian-style commas
}

module.exports = {
    formatCurrency,
};
