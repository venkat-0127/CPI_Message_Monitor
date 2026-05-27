service MonitorService {

    function getStatus() returns String;

    function getSummary() returns String;

    function getHourlyStats() returns String;

    function getMessages(
        status : String,
        flow   : String,
        top    : Integer
    ) returns String;

    function getErrorInfo(
        guid : String
    ) returns String;

    function getAttachments(
        guid : String
    ) returns String;

    function getFlows() returns String;

}