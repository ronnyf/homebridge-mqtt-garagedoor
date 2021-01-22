
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge MQTT Garagedoor

A simple plugin that subscribes to one MQTT subject - the state subject that describes the status of the garage door:
- open
- closed
- opening 
- closing
- error
- problem

One trigger value is published to the 'Set Topic' when the motor should be engaged to open or close. This system is optimized to my home setup and I tried to make it as generic as possible while being useful for me. 