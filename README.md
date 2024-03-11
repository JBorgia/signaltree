# signal-store
An Angular 16+ store built around Signals that focuses on simplicity. 

There are no selectors, actions, reduces, etc. To use, just import the signalStore() function and pass it an object that represents the initital state of the store. 

All field values should be initialized with values but undefined can be used. All MUST be typed. 

See the example.ts file for examples of how to handle unknown value inititalization. 

How tying is applied here will determine how it is treated later. 
