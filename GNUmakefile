.PHONY: all reload-and-build reload clean clobber distribute js

include build/vars.mk

all: reload-and-build

reload-and-build: reload
	$(MAKE) js

reload:
	$(MAKE) -B build/vars.mk

clean:
	-rm -rf build/

clobber: clean
	-rm -rf dist/

distribute:
	cp -pr build dist
	-rm -f dist/vars.mk

js: $(DST_JS)

build/vars.mk: tools/vars.js
	@mkdir -p $(dir $@)
	node $< > $@

BIN := $(shell npm bin)

$(DST_JS): $(SRC_TS) $(SRC_JS) $(CONFIG)
	@mkdir -p $(dir $@)
	$(BIN)/tsc
