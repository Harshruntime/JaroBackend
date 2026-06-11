const toEnum = (obj) => Object.values(obj).map((i) => i.value);

const isAvailable = (value) => value && value !== null && value !== undefined;

const filterBySchema = (data, schema) => {
    const value = {};

    Object.keys(schema).forEach((key) => {
        if (isAvailable(data[key])) {
            if (typeof data[key] === "object" && typeof schema[key] === "object") {
                value[key] = {};
                Object.keys(schema[key]).forEach((nestedKey) => {
                    if (isAvailable(data[key][nestedKey])) value[key][nestedKey] = data[key][nestedKey];
                });
            } else value[key] = data[key];
        }
    });

    return value;
};

const isValidAddress = (address) => {
    if (!isAvailable(address)) return false;

    const { street, city, state, country, pincode } = address;

    return (
        isAvailable(street) &&
        street.length > 0 &&
        isAvailable(city) &&
        city.length > 0 &&
        isAvailable(state) &&
        state.length > 0 &&
        isAvailable(country) &&
        country.length > 0 &&
        isAvailable(pincode) &&
        pincode.length > 0
    );
};

const isValidArray = (arr) => isAvailable(arr) && Array.isArray(arr) && arr.length > 0;

module.exports = {
    toEnum,
    filterBySchema,
    isAvailable,
    isValidAddress,
    isValidArray,
};
